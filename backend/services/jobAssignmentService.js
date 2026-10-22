const mongoose = require('mongoose');
const Worker = require('../models/Worker');
const Department = require('../models/Department');
const Leave = require('../models/Leave');
const Ticket = require('../models/ticketModel');
const { getIO } = require('../utils/socket');

const MAX_ACTIVE_WORKLOAD = 5; // Established overload threshold in Work Allocation (>= 5 is overloaded)

/**
 * Common domain keywords to identify target departments from ticket scope.
 */
const DEPARTMENT_DOMAIN_KEYWORDS = {
  website: ['website', 'web', 'wordpress', 'shopify', 'landing', 'portal', 'html', 'css', 'frontend', 'responsive', 'cms', 'woocommerce', 'drupal', 'wix', 'webpage', 'elementor', 'static site', 'web development', 'site'],
  software: ['software', 'backend', 'api', 'database', 'microservice', 'microservices', 'system', 'mobile', 'app', 'android', 'ios', 'flutter', 'react native', 'desktop', 'saas', 'python', 'java', 'c++', 'golang', 'devops', 'cloud', 'architecture', 'fullstack', 'rest api', 'sql', 'nosql', 'server'],
  dev: ['dev', 'development', 'code', 'deploy', 'fullstack', 'git'],
  design: ['design', 'ui', 'ux', 'figma', 'creative', 'logo', 'banner', 'graphic', 'wireframe', 'prototype', 'branding', 'photoshop', 'illustrator', 'mockup'],
  marketing: ['marketing', 'seo', 'campaign', 'adwords', 'sem', 'content', 'social', 'media', 'analytics', 'growth', 'email', 'lead', 'ads'],
  testing: ['testing', 'qa', 'quality', 'test', 'automation', 'manual', 'cypress', 'selenium', 'validation'],
  sales: ['sales', 'crm', 'client', 'deal', 'pitch', 'quote', 'closing'],
  finance: ['accounts', 'finance', 'billing', 'payroll', 'tax', 'audit', 'invoice']
};

/**
 * Checks if a department represents Website / Web Development.
 * @param {Object} dept
 * @returns {boolean}
 */
const isWebsiteDepartment = (dept) => {
  if (!dept) return false;
  const name = (dept.name || '').toLowerCase();
  const desc = (dept.description || '').toLowerCase();
  const stack = `${dept.frontendStack || ''} ${dept.backendStack || ''}`.toLowerCase();

  if (name.includes('website') || name.includes('web development') || name === 'web') return true;
  if (name.includes('web') && !name.includes('software') && !name.includes('devops')) return true;
  if (desc.includes('wordpress') || desc.includes('shopify') || desc.includes('woocommerce') || desc.includes('landing page')) return true;
  if (stack.includes('wordpress') || stack.includes('shopify') || stack.includes('html/css')) return true;
  return false;
};

/**
 * Checks if a department represents Software Development / Backend / Engineering.
 * @param {Object} dept
 * @returns {boolean}
 */
const isSoftwareDepartment = (dept) => {
  if (!dept) return false;
  if (isWebsiteDepartment(dept)) return false;
  const name = (dept.name || '').toLowerCase();
  const desc = (dept.description || '').toLowerCase();
  const stack = `${dept.frontendStack || ''} ${dept.backendStack || ''} ${dept.database || ''}`.toLowerCase();

  if (name.includes('software') || name.includes('engineering') || name === 'dev' || name.includes('backend') || name.includes('microservice')) return true;
  if (desc.includes('software') || desc.includes('microservices') || desc.includes('rest api') || desc.includes('distributed system')) return true;
  return false;
};

/**
 * Checks whether text scope refers to website development.
 * @param {string} text
 * @returns {boolean}
 */
const isWebsiteScopeText = (text) => {
  if (!text) return false;
  const t = String(text).toLowerCase();
  return t.includes('website') || t.includes('web development') || t.includes('wordpress') || t.includes('shopify') || t.includes('woocommerce') || t.includes('landing page') || t.includes('html/css') || t.includes('web portal');
};

/**
 * Checks whether text scope refers to software development.
 * @param {string} text
 * @returns {boolean}
 */
const isSoftwareScopeText = (text) => {
  if (!text) return false;
  const t = String(text).toLowerCase();
  return t.includes('software') || t.includes('microservice') || t.includes('backend api') || t.includes('rest api') || t.includes('golang') || t.includes('database optimization') || t.includes('system architecture') || t.includes('distributed system');
};

/**
 * Extracts searchable skill/scope keywords from ticket details.
 * @param {Object} ticket
 * @returns {Set<string>}
 */
const STOP_WORDS = new Set([
  'and', 'the', 'for', 'with', 'from', 'this', 'that', 'our', 'all', 'any', 'are', 'not', 'but', 'per', 'via',
  'general', 'services', 'service', 'item', 'deliverable', 'deliverables', 'project', 'work', 'task',
  'lead', 'senior', 'junior', 'associate', 'member', 'specialist', 'consultant', 'advisor', 'manager',
  'testing', 'test', 'execution', 'admin', 'customer', 'client', 'proforma', 'invoice'
]);

/**
 * Extracts searchable skill/scope keywords from ticket details.
 * @param {Object} ticket
 * @returns {Set<string>}
 */
const extractKeywords = (ticket) => {
  const textParts = [
    ticket.title || '',
    ticket.description || '',
    Array.isArray(ticket.labels) ? ticket.labels.join(' ') : '',
    Array.isArray(ticket.checklist) ? ticket.checklist.map(c => c.text || '').join(' ') : ''
  ];
  const combined = textParts.join(' ').toLowerCase();
  const words = combined.split(/[\s,.\-_/\\()[\]{}|:;!?+*&^%$#@~`"']+/).filter(w => (w.length > 2 || w === 'ui' || w === 'ux' || w === 'qa') && !STOP_WORDS.has(w));
  return new Set(words);
};

/**
 * Scores a department against a text snippet based on:
 * 1. Department name words (+5 each)
 * 2. Department description words (+3 each)
 * 3. Department tech stack (frontendStack, backendStack, database, cloudProvider) (+3 each)
 * 4. Active workers in this department:
 *    - Skills matching text keywords (+2 each)
 *    - Designation matching text keywords (+2 each)
 * 5. Semantic domain keywords (+1 each)
 *
 * @param {string} text
 * @param {Object} dept
 * @param {Array<Object>} [workers] - Active workers in tenant
 * @returns {number}
 */
const scoreDepartmentForText = (text, dept, workers = []) => {
  if (!text || !dept) return 0;
  const words = String(text).toLowerCase().split(/[\s,.\-_/\\()[\]{}|:;!?+*&^%$#@~`"']+/).filter(w => (w.length > 2 || w === 'ui' || w === 'ux' || w === 'qa') && !STOP_WORDS.has(w));
  const wordSet = new Set(words);
  if (wordSet.size === 0) return 0;

  let score = 0;
  const deptNameClean = (dept.name || '').toLowerCase();
  const deptWords = deptNameClean.split(/[\s,.\-_/\\()[\]{}|:;!?+*&^%$#@~`"']+/).filter(w => (w.length > 2 || w === 'ui' || w === 'ux' || w === 'qa') && !STOP_WORDS.has(w));

  // 1. Direct department name word match (+5 per word)
  deptWords.forEach(w => {
    if (wordSet.has(w)) score += 5;
  });

  // 2. Department description match (+3 per word)
  if (dept.description) {
    const descWords = String(dept.description).toLowerCase().split(/[\s,.\-_/\\()[\]{}|:;!?+*&^%$#@~`"']+/).filter(w => (w.length > 2 || w === 'ui' || w === 'ux' || w === 'qa') && !STOP_WORDS.has(w));
    descWords.forEach(w => {
      if (wordSet.has(w)) {
        score += 3;
      }
    });
  }

  // 3. Department tech stack matching (+3 per match)
  const stackFields = [dept.frontendStack, dept.backendStack, dept.database, dept.cloudProvider].filter(Boolean);
  if (stackFields.length > 0) {
    const stackWords = stackFields.join(' ').toLowerCase().split(/[\s,.\-_/\\()[\]{}|:;!?+*&^%$#@~`"']+/).filter(w => (w.length > 2 || w === 'ui' || w === 'ux' || w === 'qa') && !STOP_WORDS.has(w));
    stackWords.forEach(w => {
      if (wordSet.has(w)) score += 3;
    });
  }

  // 4. Active workers in this department: skills and designation (+2 per match)
  if (Array.isArray(workers) && workers.length > 0) {
    const deptIdStr = String(dept._id || '');
    const deptWorkers = workers.filter(w => {
      const wDeptId = w.department ? String(w.department._id || w.department) : '';
      if (deptIdStr && wDeptId === deptIdStr) return true;
      const wDeptName = typeof w.department === 'string' ? w.department : (w.department?.name || '');
      return wDeptName && wDeptName.toLowerCase() === deptNameClean;
    });

    const seenWorkerSkills = new Set();
    deptWorkers.forEach(w => {
      if (Array.isArray(w.skills)) {
        w.skills.forEach(skill => {
          const s = String(skill).trim().toLowerCase();
          if (s && s.length > 1 && !seenWorkerSkills.has(s) && !STOP_WORDS.has(s)) {
            seenWorkerSkills.add(s);
            const matchesExact = wordSet.has(s);
            const matchesLongToken = s.length >= 4 && Array.from(wordSet).some(token => token.includes(s));
            if (matchesExact || matchesLongToken) {
              score += 2;
            }
          }
        });
      }

      if (w.designation) {
        const desigWords = String(w.designation).toLowerCase().split(/[\s,.\-_/\\()[\]{}|:;!?+*&^%$#@~`"']+/).filter(d => (d.length > 2 || d === 'ui' || d === 'ux' || d === 'qa') && !STOP_WORDS.has(d));
        desigWords.forEach(dw => {
          if (wordSet.has(dw) && !deptWords.includes(dw)) {
            score += 2;
          }
        });
      }
    });
  }

const matchesDomainCategory = (text, category) => {
  if (!text) return false;
  const t = String(text).toLowerCase();
  if (category === 'website') return t.includes('web') || t.includes('website') || t.includes('wordpress') || t.includes('portal') || t.includes('cms');
  if (category === 'software') return (t.includes('software') || t.includes('backend') || t.includes('engineering') || t.includes('system') || t.includes('app') || t.includes('mobile')) && !t.includes('web');
  if (category === 'dev') return (t.includes('dev') || t.includes('software') || t.includes('engineering')) && !t.includes('web');
  if (category === 'design') return t.includes('design') || t.includes('creative') || t.includes('ui') || t.includes('ux');
  if (category === 'marketing') return t.includes('market') || t.includes('seo') || t.includes('growth') || t.includes('ad');
  if (category === 'testing') return t.includes('test') || t.includes('qa') || t.includes('quality');
  if (category === 'sales') return t.includes('sales') || t.includes('crm') || t.includes('client');
  if (category === 'finance') return t.includes('finance') || t.includes('account') || t.includes('billing');
  return t.includes(category);
};

  // 5. Domain keyword matching (+1 per keyword match)
  for (const [category, keywords] of Object.entries(DEPARTMENT_DOMAIN_KEYWORDS)) {
    if (matchesDomainCategory(deptNameClean, category) || (dept.description && matchesDomainCategory(dept.description, category))) {
      keywords.forEach(kw => {
        if (wordSet.has(kw)) score += 1;
      });
    }
  }

  return score;
};

/**
 * Analyzes deliverables and scope text against tenant departments to classify single vs multi-department work.
 *
 * @param {Object} params
 * @param {Array<Object|string>} params.items - Deliverable items
 * @param {string} [params.title] - Job title
 * @param {string} [params.description] - Job description
 * @param {Array<Object>} params.departments - List of departments in tenant
 * @param {Array<Object>} [params.workers] - Active workers in tenant
 * @returns {{ primaryDept: Object|null, departmentBreakdown: Array<Object>, isMultiDepartment: boolean, isAmbiguous: boolean, reason: string|null }}
 */
const analyzeScopeDepartments = ({ items = [], title = '', description = '', departments = [], workers = [] }) => {
  if (!Array.isArray(departments) || departments.length === 0) {
    return {
      primaryDept: null,
      departmentBreakdown: [],
      isMultiDepartment: false,
      isAmbiguous: true,
      reason: 'No departments configured in organization.'
    };
  }

  const deptMap = new Map(); // deptId -> { dept, items: [], score: 0 }
  const unclassifiedItems = [];

  const rawItems = Array.isArray(items) ? items : [];

  rawItems.forEach(item => {
    const text = typeof item === 'string' ? item : (item.description || item.text || '');
    if (!text.trim()) return;

    let bestDept = null;
    let maxScore = 0;

    departments.forEach(dept => {
      const s = scoreDepartmentForText(text, dept, workers);
      if (s > maxScore) {
        maxScore = s;
        bestDept = dept;
      }
    });

    if (bestDept && maxScore >= 3) {
      const key = String(bestDept._id);
      if (!deptMap.has(key)) {
        deptMap.set(key, { dept: bestDept, items: [], score: 0 });
      }
      const entry = deptMap.get(key);
      entry.items.push(item);
      entry.score += maxScore;
    } else {
      unclassifiedItems.push(item);
    }
  });

  // If item-level classification did not match anything, analyze overall scope text
  if (deptMap.size === 0) {
    const combinedScope = `${title} ${description} ${rawItems.map(i => typeof i === 'string' ? i : (i.description || i.text || '')).join(' ')}`;
    let bestDept = null;
    let highestScore = 0;
    let secondScore = 0;
    let secondDept = null;

    departments.forEach(dept => {
      const s = scoreDepartmentForText(combinedScope, dept, workers);
      if (s > highestScore) {
        secondScore = highestScore;
        secondDept = bestDept;
        highestScore = s;
        bestDept = dept;
      } else if (s > secondScore) {
        secondScore = s;
        secondDept = dept;
      }
    });

    if (!bestDept || highestScore < 3) {
      return {
        primaryDept: null,
        departmentBreakdown: [],
        isMultiDepartment: false,
        isAmbiguous: true,
        reason: 'Ambiguous department requirement: unable to determine target department/team from job scope. Left unassigned for admin review.'
      };
    }

    if (secondDept && highestScore === secondScore) {
      return {
        primaryDept: null,
        departmentBreakdown: [],
        isMultiDepartment: false,
        isAmbiguous: true,
        reason: `Ambiguous department requirement: multiple departments ('${bestDept.name}' and '${secondDept.name}') match job scope equally. Left unassigned for admin review.`
      };
    }

    return {
      primaryDept: bestDept,
      departmentBreakdown: [{ dept: bestDept, items: rawItems, score: highestScore }],
      isMultiDepartment: false,
      isAmbiguous: false,
      reason: null
    };
  }

  // Sort department breakdown by deliverable phase sequence / score
  const breakdown = Array.from(deptMap.values());
  
  // Phase sequence helper: Design -> Dev -> Testing -> Marketing -> Other
  const getPhaseWeight = (deptName) => {
    const name = deptName.toLowerCase();
    if (name.includes('design') || name.includes('creative') || name.includes('ui') || name.includes('ux')) return 1;
    if (name.includes('web') || name.includes('website')) return 2;
    if (name.includes('dev') || name.includes('software') || name.includes('engineering')) return 3;
    if (name.includes('test') || name.includes('qa') || name.includes('quality')) return 4;
    if (name.includes('market') || name.includes('seo') || name.includes('ad')) return 5;
    return 6;
  };

  breakdown.sort((a, b) => {
    const pwA = getPhaseWeight(a.dept.name);
    const pwB = getPhaseWeight(b.dept.name);
    if (pwA !== pwB) return pwA - pwB;
    return b.score - a.score;
  });

  const isMulti = breakdown.length > 1;
  const primaryDept = breakdown[0].dept;

  return {
    primaryDept,
    departmentBreakdown: breakdown,
    isMultiDepartment: isMulti,
    isAmbiguous: false,
    reason: null
  };
};

/**
 * Authoritatively classifies an invoice/job into one of:
 * - 'Website Development'
 * - 'Software Development'
 * - 'Multi-Department'
 * - 'Needs Admin Review'
 * 
 * Uses authoritative existing data in strict priority order:
 * 1. Explicit service/project category on invoice or linked project/order.
 * 2. Structured job details and deliverables.
 * 3. Invoice line-item descriptions and project metadata.
 * 4. Configured Department descriptions, technology stacks, and relevant employee skills.
 * 
 * Never relies solely on generic title 'Testing - Project Execution', invoice number, or default team.
 * Never hardcodes DEV as fallback.
 * 
 * @param {Object} params
 * @param {Object} params.invoice
 * @param {Object} [params.linkedOrder]
 * @param {Array<Object>} [params.departments]
 * @param {Array<Object>} [params.workers]
 * @returns {{ jobType: 'Website Development'|'Software Development'|'Multi-Department'|'Needs Admin Review', reason: string, priorityMatched: number, primaryDept?: Object }}
 */
const classifyInvoiceJob = ({ invoice, linkedOrder, departments = [], workers = [] }) => {
  if (!invoice) {
    return {
      jobType: 'Needs Admin Review',
      reason: 'No invoice data provided. Admin review required.',
      priorityMatched: 0
    };
  }

  // PRIORITY 1: Explicit service/project category on the invoice or linked project/order
  const explicitCategory = (
    invoice.serviceCategory ||
    invoice.projectCategory ||
    invoice.category ||
    invoice.jobType ||
    linkedOrder?.jobDetails?.serviceCategory
  );

  if (explicitCategory && typeof explicitCategory === 'string' && explicitCategory.trim()) {
    const cleanCat = explicitCategory.trim().toLowerCase();
    if (cleanCat !== 'general' && cleanCat !== 'default') {
      const isWeb = cleanCat.includes('web') || cleanCat.includes('wordpress') || cleanCat.includes('shopify') || cleanCat.includes('woocommerce');
      const isSw = cleanCat.includes('software') || cleanCat.includes('backend') || cleanCat.includes('microservice') || cleanCat.includes('api') || cleanCat.includes('cloud');
      const isMulti = cleanCat.includes('multi') || cleanCat.includes('cross') || (isWeb && isSw);

      if (isMulti) {
        return {
          jobType: 'Multi-Department',
          reason: `Explicit project category specified as '${explicitCategory}' (Multi-Department).`,
          priorityMatched: 1
        };
      }
      if (isWeb && !isSw) {
        return {
          jobType: 'Website Development',
          reason: `Explicit service/project category specified as '${explicitCategory}'.`,
          priorityMatched: 1
        };
      }
      if (isSw && !isWeb) {
        return {
          jobType: 'Software Development',
          reason: `Explicit service/project category specified as '${explicitCategory}'.`,
          priorityMatched: 1
        };
      }
    }
  }

  // PRIORITY 2: Structured job details and deliverables
  const deliverables = (
    (Array.isArray(linkedOrder?.jobDetails?.deliverables) && linkedOrder.jobDetails.deliverables) ||
    (Array.isArray(invoice.deliverables) && invoice.deliverables) ||
    (Array.isArray(invoice.structuredJobDetails?.deliverables) && invoice.structuredJobDetails.deliverables) ||
    []
  );

  if (deliverables.length > 0) {
    let hasWebDeliverable = false;
    let hasSoftwareDeliverable = false;
    let hasOtherDeliverable = false;

    deliverables.forEach(deliv => {
      const text = typeof deliv === 'string' ? deliv : (deliv.description || deliv.text || '');
      if (isWebsiteScopeText(text)) hasWebDeliverable = true;
      if (isSoftwareScopeText(text)) hasSoftwareDeliverable = true;
      const lower = text.toLowerCase();
      if (lower.includes('figma') || lower.includes('ui/ux') || lower.includes('seo') || lower.includes('marketing') || lower.includes('branding')) {
        hasOtherDeliverable = true;
      }
    });

    if ((hasWebDeliverable && hasSoftwareDeliverable) || (hasWebDeliverable && hasOtherDeliverable) || (hasSoftwareDeliverable && hasOtherDeliverable)) {
      return {
        jobType: 'Multi-Department',
        reason: 'Structured deliverables contain distinct multi-department scopes (Website and Software/Other).',
        priorityMatched: 2
      };
    }
    if (hasWebDeliverable && !hasSoftwareDeliverable) {
      return {
        jobType: 'Website Development',
        reason: 'Structured deliverables exclusively require website development work.',
        priorityMatched: 2
      };
    }
    if (hasSoftwareDeliverable && !hasWebDeliverable) {
      return {
        jobType: 'Software Development',
        reason: 'Structured deliverables exclusively require software development work.',
        priorityMatched: 2
      };
    }
  }

  // PRIORITY 3: Invoice line-item descriptions and existing project metadata
  const items = Array.isArray(invoice.items) ? invoice.items : [];
  if (items.length > 0) {
    let webItemCount = 0;
    let swItemCount = 0;
    let otherItemCount = 0;

    items.forEach(item => {
      const desc = typeof item === 'string' ? item : (item.description || item.text || '');
      const isWeb = isWebsiteScopeText(desc);
      const isSw = isSoftwareScopeText(desc);
      const descLower = desc.toLowerCase();
      const isOther = descLower.includes('figma') || descLower.includes('ui/ux') || descLower.includes('seo') || descLower.includes('branding') || descLower.includes('google ads') || descLower.includes('marketing');

      if (isWeb) webItemCount++;
      if (isSw) swItemCount++;
      if (isOther && !isWeb && !isSw) otherItemCount++;
    });

    if ((webItemCount > 0 && swItemCount > 0) || (webItemCount > 0 && otherItemCount > 0) || (swItemCount > 0 && otherItemCount > 0)) {
      return {
        jobType: 'Multi-Department',
        reason: 'Invoice line-item descriptions span multiple departments (Website and Software/Other).',
        priorityMatched: 3
      };
    }
    if (webItemCount > 0 && swItemCount === 0 && otherItemCount === 0) {
      return {
        jobType: 'Website Development',
        reason: 'Invoice line items specify website development (WordPress, WooCommerce, responsive HTML/CSS, or web portal).',
        priorityMatched: 3
      };
    }
    if (swItemCount > 0 && webItemCount === 0 && otherItemCount === 0) {
      return {
        jobType: 'Software Development',
        reason: 'Invoice line items specify software development (microservices, REST APIs, database optimization, or backend architecture).',
        priorityMatched: 3
      };
    }
  }

  // PRIORITY 4: Configured Department descriptions, technology stacks, and relevant employee skills as supporting evidence
  if (Array.isArray(departments) && departments.length > 0) {
    const rawTitle = invoice.title || invoice.notes || '';
    const cleanTitle = (rawTitle.toLowerCase().includes('testing - project execution') || rawTitle.toLowerCase().includes('project execution')) ? '' : rawTitle;
    const combinedScope = `${cleanTitle} ${items.map(i => typeof i === 'string' ? i : (i.description || '')).join(' ')}`.trim();

    const deptScores = departments.map(d => ({
      dept: d,
      score: scoreDepartmentForText(combinedScope, d, workers)
    })).sort((a, b) => b.score - a.score);

    const top = deptScores[0];
    const second = deptScores[1];

    // If both Web and Software (or another dept) have equal positive scores (tie)
    if (top && second && top.score > 0 && top.score === second.score) {
      return {
        jobType: 'Needs Admin Review',
        reason: `Classification scores tied between multiple departments ('${top.dept.name}' and '${second.dept.name}'). Admin review required.`,
        priorityMatched: 4
      };
    }

    // If evidence is insufficient (score < 3)
    if (!top || top.score < 3) {
      return {
        jobType: 'Needs Admin Review',
        reason: 'Ambiguous scope or insufficient evidence: invoice line items do not conclusively match configured department technology stacks or employee skills. Admin review required.',
        priorityMatched: 4
      };
    }

    // Top department matches
    if (isWebsiteDepartment(top.dept)) {
      return {
        jobType: 'Website Development',
        reason: `Invoice scope matches existing '${top.dept.name}' department technology stack and employee skills.`,
        priorityMatched: 4,
        primaryDept: top.dept
      };
    }

    if (isSoftwareDepartment(top.dept)) {
      return {
        jobType: 'Software Development',
        reason: `Invoice scope matches existing '${top.dept.name}' department technology stack and employee skills.`,
        priorityMatched: 4,
        primaryDept: top.dept
      };
    }

    // Another department scored high (e.g. Design Studio or Digital Marketing)
    return {
      jobType: 'Needs Admin Review',
      reason: `Invoice scope matches configured department '${top.dept.name}', which requires admin review and manual allocation.`,
      priorityMatched: 4,
      primaryDept: top.dept
    };
  }

  // Fallback if no departments configured or empty
  return {
    jobType: 'Needs Admin Review',
    reason: 'No department configuration or insufficient evidence to determine job type. Admin review required.',
    priorityMatched: 4
  };
};

/**
 * Resolves the target Department for a ticket based on explicit fields or scope inspection.
 * Fails closed (returns ambiguous) if no reliable department can be determined.
 *
 * @param {Object} ticket
 * @param {Array<Object>} departments - List of departments in tenant
 * @param {string} [requestedTeam] - Explicitly requested team override
 * @param {Array<Object>} [workers] - Active workers in tenant
 * @returns {{ department: Object|null, isAmbiguous: boolean, reason: string|null }}
 */
const detectTargetDepartment = (ticket, departments, requestedTeam, workers = []) => {
  if (!Array.isArray(departments) || departments.length === 0) {
    return {
      department: null,
      isAmbiguous: true,
      reason: 'No departments configured in organization.'
    };
  }

  // 0. Check explicit job-type labels on ticket or explicit serviceCategory
  const ticketLabels = Array.isArray(ticket.labels) ? ticket.labels.map(l => String(l).toLowerCase()) : [];
  if (ticketLabels.includes('job-type:website') || ticket.jobType === 'Website Development' || ticket.serviceCategory === 'Website Development') {
    const webDept = departments.find(d => isWebsiteDepartment(d));
    if (webDept) {
      return { department: webDept, isAmbiguous: false, reason: null };
    }
  }
  if (ticketLabels.includes('job-type:software') || ticket.jobType === 'Software Development' || ticket.serviceCategory === 'Software Development') {
    const swDept = departments.find(d => isSoftwareDepartment(d));
    if (swDept) {
      return { department: swDept, isAmbiguous: false, reason: null };
    }
  }

  // 1. Check explicit requestedTeam parameter
  if (requestedTeam && typeof requestedTeam === 'string' && requestedTeam.trim()) {
    const cleanReq = requestedTeam.trim();
    const cleanReqLower = cleanReq.toLowerCase();
    const match = departments.find(d => {
      const dName = d.name.toLowerCase();
      if (dName === cleanReqLower || String(d._id) === cleanReq) return true;
      if ((cleanReqLower === 'dev' || cleanReqLower === 'development') && (dName.includes('dev') || dName.includes('software') || dName.includes('engineering'))) {
        return true;
      }
      return false;
    });
    if (match) {
      return { department: match, isAmbiguous: false, reason: null };
    }

    return {
      department: null,
      isAmbiguous: true,
      reason: `Requested team '${cleanReq}' does not match any configured department.`
    };
  }

  // 2. Inspect ticket keywords across line items, title, description, labels, and checklist
  // Strip out autogenerated invoice prefix and generic 'Testing - Project Execution' title
  const cleanTitle = (ticket.title || '')
    .replace(/\[invoice\s*#[^\]]+\]/gi, '')
    .replace(/testing\s*-\s*project\s*execution/gi, '')
    .replace(/project\s*execution/gi, '')
    .trim();

  const ticketText = [
    cleanTitle,
    ticket.description || '',
    Array.isArray(ticket.labels) ? ticket.labels.join(' ') : '',
    Array.isArray(ticket.checklist) ? ticket.checklist.map(c => c.text || '').join(' ') : ''
  ].join(' ');

  const deptScores = departments.map(dept => {
    const score = scoreDepartmentForText(ticketText, dept, workers);
    return { dept, score };
  });

  deptScores.sort((a, b) => b.score - a.score);

  const top = deptScores[0];
  if (top && top.score > 0) {
    // Check for tie between top candidates
    if (deptScores.length > 1 && deptScores[1].score === top.score) {
      return {
        department: null,
        isAmbiguous: true,
        reason: `Ambiguous department requirement: multiple departments ('${top.dept.name}' and '${deptScores[1].dept.name}') match job scope equally. Left unassigned for admin review.`
      };
    }
    return { department: top.dept, isAmbiguous: false, reason: null };
  }

  // 3. Fall back to ticket.team only if scope text did not yield any positive match
  const rawTicketTeam = (ticket.team || '').trim();
  if (rawTicketTeam) {
    const rawClean = rawTicketTeam.toLowerCase();
    const directMatch = departments.find(d => {
      const dName = d.name.toLowerCase();
      if (dName === rawClean || String(d._id) === rawClean) return true;
      if ((rawClean === 'dev' || rawClean === 'development') && (dName.includes('dev') || dName.includes('software') || dName.includes('engineering'))) {
        return true;
      }
      return false;
    });
    if (directMatch) {
      return { department: directMatch, isAmbiguous: false, reason: null };
    }
  }

  return {
    department: null,
    isAmbiguous: true,
    reason: 'Ambiguous department requirement: unable to determine target department/team from job scope. Left unassigned for admin review.'
  };
};

/**
 * Determines the assignment mode: 'Individual', 'Team', or 'Both'.
 *
 * @param {Object} ticket
 * @param {string} [requestedMode]
 * @returns {'Individual'|'Team'|'Both'}
 */
const detectAssignmentMode = (ticket, requestedMode) => {
  if (requestedMode && ['Individual', 'Team', 'Both'].includes(requestedMode)) {
    return requestedMode;
  }

  if (ticket.assignmentMode && ['Individual', 'Team', 'Both'].includes(ticket.assignmentMode)) {
    return ticket.assignmentMode;
  }

  const labels = Array.isArray(ticket.labels) ? ticket.labels.map(l => String(l).toLowerCase()) : [];
  if (labels.some(l => l.includes('mode:both') || l.includes('assignment:both') || l.includes('multi-member') || l.includes('group-task'))) {
    return 'Both';
  }
  if (labels.some(l => l.includes('mode:team') || l.includes('assignment:team') || l.includes('team-task'))) {
    return 'Team';
  }

  // Check if title / description explicitly mentions multi-member requirements
  const desc = `${ticket.title || ''} ${ticket.description || ''}`.toLowerCase();
  if (desc.includes('multi-member') || desc.includes('assign team and lead') || desc.includes('cross-functional team')) {
    return 'Both';
  }
  if (desc.includes('team assignment') || desc.includes('entire team') || desc.includes('department allocation')) {
    return 'Team';
  }

  return 'Individual';
};

/**
 * Checks whether a candidate worker matches the target department.
 *
 * @param {Object} worker
 * @param {Object} targetDept
 * @returns {boolean}
 */
const isWorkerInDepartment = (worker, targetDept) => {
  if (!worker || !targetDept) return false;

  // Strict tenant boundary: worker and department must belong to the same tenant
  if (worker.subdomain && targetDept.subdomain && worker.subdomain.toLowerCase() !== targetDept.subdomain.toLowerCase()) {
    return false;
  }

  const workerDeptId = worker.department ? String(worker.department._id || worker.department) : '';
  if (workerDeptId && workerDeptId === String(targetDept._id)) return true;

  // Department assignedDevelopers array
  if (Array.isArray(targetDept.assignedDevelopers) && targetDept.assignedDevelopers.some(id => String(id) === String(worker._id))) {
    return true;
  }

  const targetName = (targetDept.name || '').trim().toLowerCase();

  // Match by department name string or populated department object
  if (worker.department) {
    const rawDeptStr = typeof worker.department === 'string'
      ? worker.department
      : (worker.department.name || '');
    if (rawDeptStr && rawDeptStr.trim().toLowerCase() === targetName) {
      return true;
    }
    // Worker is explicitly assigned to another department; do not match
    return false;
  }

  return false;
};

/**
 * Calculates candidate score and sorts candidates deterministically.
 */
const scoreAndRankCandidates = (candidates, ticket, workerWorkloadMap) => {
  const ticketKeywords = extractKeywords(ticket);

  const scored = candidates.map(worker => {
    const activeTasks = workerWorkloadMap.get(String(worker._id)) || 0;

    // Workload Score: (5 - activeTasks) * 100
    const workloadScore = (MAX_ACTIVE_WORKLOAD - activeTasks) * 100;

    // Skill Match Score: +25 per matching skill keyword
    let matchedSkillsCount = 0;
    if (Array.isArray(worker.skills)) {
      worker.skills.forEach(skill => {
        const cleanSkill = String(skill).trim().toLowerCase();
        if (cleanSkill && (ticketKeywords.has(cleanSkill) || Array.from(ticketKeywords).some(k => k.includes(cleanSkill) || cleanSkill.includes(k)))) {
          matchedSkillsCount += 1;
        }
      });
    }
    const skillScore = matchedSkillsCount * 25;

    // KPI Score: Up to 50 points based on validated System 3 formula
    let kpiScore = 0;
    if (worker.kpiScore !== undefined && typeof worker.kpiScore === 'number') {
      kpiScore = Math.min(50, Math.max(0, worker.kpiScore));
    } else {
      const { calculateAssignmentKpiScore } = require('./kpiComputationService');
      const derivedOtcr = (typeof worker.otcr === 'number')
        ? worker.otcr
        : ((typeof worker.totalCompletedTickets === 'number' && worker.totalCompletedTickets > 0 && typeof worker.totalDelayedTickets === 'number')
          ? Math.max(0, Math.min(100, Math.round(((worker.totalCompletedTickets - worker.totalDelayedTickets) / worker.totalCompletedTickets) * 100)))
          : null);

      const kpiRes = calculateAssignmentKpiScore({
        performancePoints: worker.performancePoints || 0,
        otcr: derivedOtcr,
        ftar: typeof worker.ftar === 'number' ? worker.ftar : null
      });
      kpiScore = kpiRes.totalScore;
    }

    const totalScore = workloadScore + skillScore + kpiScore;

    return {
      worker,
      activeTasks,
      matchedSkillsCount,
      totalScore,
      completedTickets: typeof worker.totalCompletedTickets === 'number' ? worker.totalCompletedTickets : 0,
      createdAt: worker.createdAt ? new Date(worker.createdAt).getTime() : 0,
      idStr: String(worker._id)
    };
  });

  // Deterministic sorting
  scored.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    if (b.completedTickets !== a.completedTickets) return b.completedTickets - a.completedTickets;
    if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
    return a.idStr.localeCompare(b.idStr);
  });

  return scored;
};

/**
 * Automatically assign an active, unassigned ticket supporting Individual, Team, and Both modes.
 *
 * @param {Object} params
 * @param {Object|string} params.ticket - Ticket document or ticket ID
 * @param {string} params.subdomain - Authorized tenant subdomain
 * @param {import('mongoose').ClientSession} [params.session] - Optional Mongoose session
 * @param {'Individual'|'Team'|'Both'} [params.mode] - Optional assignment mode
 * @param {string} [params.requestedTeam] - Optional requested team/department name
 * @param {number} [params.requiredMembersCount] - Optional member count for multi-member mode
 * @returns {Promise<Object>} Assignment result
 */
const autoAssignJobTicket = async ({
  ticket: ticketParam,
  subdomain,
  session,
  mode: requestedMode,
  requestedTeam: initialRequestedTeam,
  jobType,
  requiredMembersCount,
  teamSize,
  requestedLead
}) => {
  if (!subdomain || typeof subdomain !== 'string' || !subdomain.trim()) {
    throw new Error('Tenant subdomain is required for automatic job assignment.');
  }

  const tenant = subdomain.trim().toLowerCase();

  // 1. Fetch active ticket
  let ticket = ticketParam;
  if (!ticket || typeof ticket !== 'object' || !ticket._id) {
    ticket = await Ticket.findOne({ _id: ticketParam, subdomain: tenant });
  }

  if (!ticket) {
    throw new Error(`Ticket not found in tenant '${tenant}'.`);
  }

  // Tenant validation
  if (ticket.subdomain && ticket.subdomain.toLowerCase() !== tenant) {
    const err = new Error(`Tenant mismatch: ticket belongs to '${ticket.subdomain}', not '${tenant}'.`);
    err.statusCode = 403;
    throw err;
  }

  // Idempotency check: if ticket already has an assignee, do NOT overwrite or reassign
  if (ticket.assignee) {
    return {
      success: true,
      assigned: false,
      isAlreadyAssigned: true,
      assignee: ticket.assignee,
      assignees: ticket.assignees || [ticket.assignee],
      ticket
    };
  }

  // 2. Fetch all Active workers in tenant
  const activeWorkers = await Worker.find({
    subdomain: tenant,
    status: 'Active'
  }).lean();

  if (activeWorkers.length === 0) {
    const reason = `No active employees found in organization '${tenant}'.`;
    await setTicketUnassigned(ticket._id, tenant, reason, session);
    return { success: true, assigned: false, unassignedReason: reason, ticket };
  }

  // 3. Resolve departments in tenant
  const departments = await Department.find({ subdomain: tenant }).lean();
  if (departments.length === 0) {
    const reason = `No departments configured in organization '${tenant}'.`;
    await setTicketUnassigned(ticket._id, tenant, reason, session);
    return { success: true, assigned: false, unassignedReason: reason, ticket };
  }

  let requestedTeam = initialRequestedTeam;
  if (!requestedTeam && (jobType === 'Website Development' || ticket.jobType === 'Website Development' || ticket.serviceCategory === 'Website Development' || (Array.isArray(ticket.labels) && ticket.labels.includes('job-type:website')))) {
    const webDept = departments.find(d => isWebsiteDepartment(d));
    if (webDept) {
      requestedTeam = webDept.name;
    }
  }

  // 4. Determine Target Department & Ambiguity Check
  const deptResult = detectTargetDepartment(ticket, departments, requestedTeam, activeWorkers);
  if (deptResult.isAmbiguous || !deptResult.department) {
    const reason = deptResult.reason || 'Ambiguous department requirement: unable to determine target department.';
    await setTicketUnassigned(ticket._id, tenant, reason, session);
    return { success: true, assigned: false, unassignedReason: reason, ticket };
  }

  const targetDept = deptResult.department;
  const deptName = targetDept.name;

  // Business Rule: Disable general automatic assignment.
  // Only Website Development is eligible for automatic employee assignment.
  // Software jobs and other functional departments require manual team/employee selection unless requestedMode is explicitly provided.
  if (!requestedMode) {
    if (isSoftwareDepartment(targetDept)) {
      const reason = 'Software job detected — please select the appropriate existing team and assignees.';
      await setTicketUnassigned(ticket._id, tenant, reason, session);
      return { success: true, assigned: false, unassignedReason: reason, ticket };
    }

    if (!isWebsiteDepartment(targetDept)) {
      const reason = `General auto-assignment is disabled for '${deptName}'. Please select the appropriate existing team and assignees in Work Allocation.`;
      await setTicketUnassigned(ticket._id, tenant, reason, session);
      return { success: true, assigned: false, unassignedReason: reason, ticket };
    }
  }

  // Filter candidate workers for target department
  const deptCandidates = activeWorkers.filter(w => isWorkerInDepartment(w, targetDept));
  if (deptCandidates.length === 0) {
    const reason = `No active employees found in team/department '${deptName}'.`;
    await setTicketUnassigned(ticket._id, tenant, reason, session);
    return { success: true, assigned: false, unassignedReason: reason, ticket };
  }

  // 5. Availability Check: Exclude employees on approved leave today
  const candidateIds = deptCandidates.map(w => w._id);
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);

  const activeLeaves = await Leave.find({
    subdomain: tenant,
    worker: { $in: candidateIds },
    status: 'Approved',
    startDate: { $lte: todayEnd },
    endDate: { $gte: todayStart }
  }).select('worker').lean();

  const onLeaveWorkerIds = new Set(activeLeaves.map(l => String(l.worker)));
  const availableCandidates = deptCandidates.filter(w => !onLeaveWorkerIds.has(String(w._id)));

  if (availableCandidates.length === 0) {
    const reason = `All eligible employees in team '${deptName}' are currently on approved leave.`;
    await setTicketUnassigned(ticket._id, tenant, reason, session);
    return { success: true, assigned: false, unassignedReason: reason, ticket };
  }

  // 6. Workload Calculation: Count active tasks for available candidates
  const activeTickets = await Ticket.find({
    subdomain: tenant,
    isDeleted: { $ne: true },
    status: { $in: ['To Do', 'In Progress', 'Review'] },
    $or: [
      { assignee: { $in: availableCandidates.map(w => w._id) } },
      { assignees: { $in: availableCandidates.map(w => w._id) } }
    ]
  }).select('assignee assignees').lean();

  const workerWorkloadMap = new Map();
  availableCandidates.forEach(w => workerWorkloadMap.set(String(w._id), 0));

  activeTickets.forEach(t => {
    const aid = t.assignee ? String(t.assignee) : null;
    if (aid && workerWorkloadMap.has(aid)) {
      workerWorkloadMap.set(aid, workerWorkloadMap.get(aid) + 1);
    }
    if (Array.isArray(t.assignees)) {
      t.assignees.forEach(a => {
        const id = String(a);
        if (id && id !== aid && workerWorkloadMap.has(id)) {
          workerWorkloadMap.set(id, workerWorkloadMap.get(id) + 1);
        }
      });
    }
  });

  // Filter out overloaded workers (>= 5 active tasks)
  const nonOverloadedCandidates = availableCandidates.filter(w => {
    const load = workerWorkloadMap.get(String(w._id)) || 0;
    return load < MAX_ACTIVE_WORKLOAD;
  });

  if (nonOverloadedCandidates.length === 0) {
    const reason = `All available employees in team '${deptName}' are at maximum capacity (>= ${MAX_ACTIVE_WORKLOAD} active tasks).`;
    await setTicketUnassigned(ticket._id, tenant, reason, session);
    return { success: true, assigned: false, unassignedReason: reason, ticket };
  }

  // 7. Determine Assignment Mode
  // For Website Development, auto-assignment must always assign exactly one suitable employee (Individual mode)
  const isWebJob = isWebsiteDepartment(targetDept) || jobType === 'Website Development' || (Array.isArray(ticket.labels) && ticket.labels.includes('job-type:website'));
  const assignmentMode = isWebJob ? (requestedMode || 'Individual') : detectAssignmentMode(ticket, requestedMode);

  // Authoritative System 3 KPI Profile enrichment for eligible candidates
  const { computeWorkerKpi } = require('./kpiComputationService');
  const enrichedCandidates = await Promise.all(
    nonOverloadedCandidates.map(async (candidate) => {
      try {
        const kpiProfile = await computeWorkerKpi(candidate, tenant);
        if (kpiProfile && kpiProfile.system2Assignment) {
          return {
            ...candidate,
            kpiScore: kpiProfile.system2Assignment.kpiScore,
            kpiBreakdown: kpiProfile.system2Assignment.breakdown,
            otcr: kpiProfile.metrics.onTimeCompletionRate,
            ftar: kpiProfile.metrics.firstTimeApprovalRate,
            kpiExplanation: kpiProfile.system2Assignment.explanation
          };
        }
      } catch (kpiErr) {
        // Safe fail-soft: if System 3 profile computation encounters an error, proceed with candidate data
      }
      return candidate;
    })
  );

  // Score and rank non-overloaded candidates
  const rankedCandidates = scoreAndRankCandidates(enrichedCandidates, ticket, workerWorkloadMap);

  let chosenLead = null;
  let chosenAssignees = [];
  let assignmentReason = '';

  // Mode Execution:
  if (assignmentMode === 'Individual') {
    chosenLead = rankedCandidates[0].worker;
    chosenAssignees = [chosenLead._id];
    const kpiInfo = rankedCandidates[0].worker.kpiScore !== undefined ? `, KPI (${rankedCandidates[0].worker.kpiScore}/50)` : '';
    assignmentReason = `Auto-assigned (Individual): Team '${deptName}', employee '${chosenLead.name}', workload (${rankedCandidates[0].activeTasks}/${MAX_ACTIVE_WORKLOAD})${kpiInfo}`;

  } else if (assignmentMode === 'Team') {
    // Mode Team: Assign requested number of top-ranked candidates
    const targetCount = (typeof teamSize === 'number' && teamSize > 0)
      ? teamSize
      : ((typeof requiredMembersCount === 'number' && requiredMembersCount > 0)
        ? requiredMembersCount
        : rankedCandidates.length);

    if (targetCount > rankedCandidates.length) {
      const reason = `Insufficient eligible employees available in team '${deptName}' (requested ${targetCount}, available ${rankedCandidates.length}).`;
      await setTicketUnassigned(ticket._id, tenant, reason, session);
      return { success: true, assigned: false, unassignedReason: reason, ticket };
    }

    const leadIdStr = targetDept.projectLead ? String(targetDept.projectLead) : null;
    const leadCandidate = leadIdStr ? rankedCandidates.find(c => String(c.worker._id) === leadIdStr) : null;

    chosenLead = leadCandidate ? leadCandidate.worker : rankedCandidates[0].worker;
    const chosen = rankedCandidates.slice(0, targetCount);
    chosenAssignees = chosen.map(c => c.worker._id);
    if (!chosenAssignees.some(id => String(id) === String(chosenLead._id))) {
      chosenLead = chosen[0].worker;
    }
    assignmentReason = `Auto-assigned (Team): Team '${deptName}', lead '${chosenLead.name}', ${chosenAssignees.length} team members allocated`;

  } else if (assignmentMode === 'Both') {
    // Mode Both / Multi-Member: Assign lead + additional distinct members
    const rawTarget = typeof teamSize === 'number' && teamSize > 0 ? teamSize : requiredMembersCount;
    const targetCount = Math.max(2, (typeof rawTarget === 'number' && rawTarget > 0) ? rawTarget : 2);

    if (targetCount > rankedCandidates.length) {
      const reason = `Insufficient eligible employees available in team '${deptName}' for multi-member assignment (needed at least ${targetCount}, found ${rankedCandidates.length}).`;
      await setTicketUnassigned(ticket._id, tenant, reason, session);
      return { success: true, assigned: false, unassignedReason: reason, ticket };
    }

    // Preserve requested lead if provided
    let chosenLeadWorker = null;
    if (requestedLead) {
      const reqLeadId = String(requestedLead._id || requestedLead);
      const leadCandidate = rankedCandidates.find(c => String(c.worker._id) === reqLeadId);
      if (!leadCandidate) {
        const reason = `Designated lead employee is ineligible or not available in team '${deptName}'.`;
        await setTicketUnassigned(ticket._id, tenant, reason, session);
        return { success: true, assigned: false, unassignedReason: reason, ticket };
      }
      chosenLeadWorker = leadCandidate.worker;
    } else {
      const leadIdStr = targetDept.projectLead ? String(targetDept.projectLead) : null;
      const leadCandidate = leadIdStr ? rankedCandidates.find(c => String(c.worker._id) === leadIdStr) : null;
      chosenLeadWorker = leadCandidate ? leadCandidate.worker : rankedCandidates[0].worker;
    }

    chosenLead = chosenLeadWorker;
    const selectedIds = [chosenLead._id];
    for (const item of rankedCandidates) {
      if (String(item.worker._id) !== String(chosenLead._id)) {
        selectedIds.push(item.worker._id);
        if (selectedIds.length >= targetCount) break;
      }
    }

    if (selectedIds.length < 2) {
      const reason = `Insufficient eligible employees available in team '${deptName}' for multi-member assignment (needed at least 2, found ${selectedIds.length}).`;
      await setTicketUnassigned(ticket._id, tenant, reason, session);
      return { success: true, assigned: false, unassignedReason: reason, ticket };
    }

    chosenAssignees = selectedIds;
    assignmentReason = `Auto-assigned (Both / Multi-Member): Team '${deptName}', lead '${chosenLead.name}', ${chosenAssignees.length} members assigned`;
  }

  // 8. Atomic Compare-and-Set Assignment
  const assignmentRecord = {
    previousAssignee: null,
    newAssignee: chosenLead._id,
    assignedAt: new Date(),
    assignedBy: null,
    assignedByModel: 'System',
    source: 'automatic',
    reason: assignmentReason
  };

  const updatedTicket = await Ticket.findOneAndUpdate(
    {
      _id: ticket._id,
      subdomain: tenant,
      isDeleted: { $ne: true },
      $or: [
        { assignee: null },
        { assignee: { $exists: false } }
      ]
    },
    {
      $set: {
        assignee: chosenLead._id,
        assignees: chosenAssignees,
        team: deptName,
        assignmentSource: 'automatic',
        assignmentMode,
        unassignedReason: null
      },
      $push: {
        assignmentHistory: assignmentRecord
      }
    },
    { new: true, session }
  );

  // Concurrency check: If another process updated first, return existing assignment
  if (!updatedTicket) {
    const refreshedTicket = await Ticket.findById(ticket._id);
    return {
      success: true,
      assigned: false,
      isAlreadyAssigned: true,
      assignee: refreshedTicket?.assignee,
      assignees: refreshedTicket?.assignees || [],
      ticket: refreshedTicket
    };
  }

  // Socket notification
  try {
    const io = getIO();
    if (io) {
      io.to(tenant).emit('ticket:updated', updatedTicket);
    }
  } catch (ioErr) {
    // Non-blocking socket emission
  }

  return {
    success: true,
    assigned: true,
    mode: assignmentMode,
    team: deptName,
    assignee: chosenLead,
    assigneeId: chosenLead._id,
    assignees: chosenAssignees,
    ticket: updatedTicket
  };
};

/**
 * Sets a ticket's unassigned reason and records automatic assignment attempt.
 */
const setTicketUnassigned = async (ticketId, subdomain, reason, session) => {
  const historyEntry = {
    previousAssignee: null,
    newAssignee: null,
    assignedAt: new Date(),
    assignedBy: null,
    assignedByModel: 'System',
    source: 'automatic',
    reason
  };

  return Ticket.findOneAndUpdate(
    {
      _id: ticketId,
      subdomain,
      $or: [
        { assignee: null },
        { assignee: { $exists: false } }
      ]
    },
    {
      $set: {
        team: null,
        assignee: null,
        assignees: [],
        assignmentSource: 'automatic',
        unassignedReason: reason
      },
      $push: {
        assignmentHistory: historyEntry
      }
    },
    { new: true, session }
  );
};

module.exports = {
  autoAssignJobTicket,
  classifyInvoiceJob,
  detectTargetDepartment,
  detectAssignmentMode,
  analyzeScopeDepartments,
  scoreDepartmentForText,
  isWebsiteDepartment,
  isSoftwareDepartment,
  isWebsiteScopeText,
  isSoftwareScopeText,
  scoreAndRankCandidates,
  MAX_ACTIVE_WORKLOAD
};
