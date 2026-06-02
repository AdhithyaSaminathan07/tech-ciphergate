const SecondBrainItem = require('../models/SecondBrainItem');

/**
 * Syncs or updates an item in the Second Brain database.
 * @param {string} type - The item type ('project', 'worker', 'wiki', 'ticket')
 * @param {object} item - The Mongoose document
 * @param {string} subdomain - The company subdomain context
 */
const syncBrainItem = async (type, item, subdomain) => {
  if (!subdomain || !item || !item._id) return;
  
  let title = '';
  let content = '';
  let tags = [];
  let metadata = {};
  let refModel = '';
  
  if (type === 'project') {
    refModel = 'Department';
    title = item.name;
    
    const stackList = [item.frontendStack, item.backendStack, item.database, item.cloudProvider].filter(Boolean);
    const reposList = [
      item.primaryRepoUrl ? `Primary: ${item.primaryRepoUrl}` : null,
      item.documentationRepoUrl ? `Docs: ${item.documentationRepoUrl}` : null,
      item.moduleRepos && item.moduleRepos.length > 0 ? `Modules: ${item.moduleRepos.join(', ')}` : null
    ].filter(Boolean);
    
    content = [
      `Project/Product Name: ${item.name}`,
      `Type: ${item.departmentType || 'Project'}`,
      `Status: ${item.projectStatus || 'In Progress'}`,
      `Priority: ${item.projectPriority || 'Medium'}`,
      item.description ? `Description: ${item.description}` : null,
      stackList.length > 0 ? `Tech Stack: ${stackList.join(', ')}` : null,
      item.deploymentUrl ? `Deployment URL: ${item.deploymentUrl}` : null,
      reposList.length > 0 ? `GitHub Repositories:\n${reposList.join('\n')}` : null
    ].filter(Boolean).join('\n');
    
    tags = [
      item.departmentType,
      item.projectStatus,
      item.projectPriority,
      item.frontendStack,
      item.backendStack,
      item.database,
      item.cloudProvider
    ].filter(Boolean).map(t => t.toLowerCase());
    
    metadata = {
      departmentType: item.departmentType,
      projectStatus: item.projectStatus,
      projectPriority: item.projectPriority,
      frontendStack: item.frontendStack,
      backendStack: item.backendStack,
      database: item.database,
      cloudProvider: item.cloudProvider,
      deploymentUrl: item.deploymentUrl,
      primaryRepoUrl: item.primaryRepoUrl,
      moduleRepos: item.moduleRepos || [],
      documentationRepoUrl: item.documentationRepoUrl,
      projectLead: item.projectLead,
      projectManager: item.projectManager,
      assignedDevelopers: item.assignedDevelopers || []
    };
  } else if (type === 'wiki') {
    refModel = 'InternalDocument';
    title = item.title;
    content = `Title: ${item.title}\nCategory: ${item.category || 'General'}\nContent:\n${item.content}`;
    tags = Array.isArray(item.tags) ? item.tags.map(t => t.toLowerCase()) : [];
    metadata = {
      category: item.category,
      tags: item.tags || [],
      createdBy: item.createdBy
    };
  } else if (type === 'worker') {
    refModel = 'Worker';
    title = item.name;
    const skills = Array.isArray(item.skills) ? item.skills : [];
    content = [
      `Developer: ${item.name}`,
      `Username: ${item.username}`,
      skills.length > 0 ? `Skills: ${skills.join(', ')}` : null,
      item.gitContributions ? `GitHub Contribution Score: ${item.gitContributions}` : null,
      item.completedTasksCount ? `Completed Tasks Count: ${item.completedTasksCount}` : null,
      item.expertiseProfile ? `Expertise Profile: ${JSON.stringify(item.expertiseProfile)}` : null
    ].filter(Boolean).join('\n');
    
    tags = [...skills].filter(Boolean).map(s => s.toLowerCase());
    metadata = {
      username: item.username,
      skills,
      gitContributions: item.gitContributions || 0,
      completedTasksCount: item.completedTasksCount || 0,
      activeTasksCount: item.activeTasksCount || 0,
      expertiseProfile: item.expertiseProfile || {}
    };
  } else if (type === 'ticket') {
    refModel = 'Ticket';
    title = item.title;
    content = [
      `Ticket Title: ${item.title}`,
      item.description ? `Description: ${item.description}` : null,
      `Priority: ${item.priority}`,
      `Status: ${item.status}`,
      `Issue Type: ${item.issueType || 'Task'}`,
      item.storyPoints ? `Story Points: ${item.storyPoints}` : null
    ].filter(Boolean).join('\n');
    
    tags = Array.isArray(item.labels) ? item.labels.map(l => l.toLowerCase()) : [];
    metadata = {
      priority: item.priority,
      status: item.status,
      issueType: item.issueType,
      storyPoints: item.storyPoints,
      labels: item.labels || []
    };
  }
  
  if (!refModel) return;
  
  try {
    await SecondBrainItem.findOneAndUpdate(
      { itemRef: item._id, subdomain },
      { title, content, type, refModel, tags, metadata, subdomain },
      { upsert: true, new: true }
    );
    console.log(`[SecondBrain] Successfully indexed ${type} item: "${title}"`);
  } catch (error) {
    console.error(`[SecondBrain] Failed to index ${type} item ${item._id}:`, error.message);
  }
};

/**
 * Compiles a developer's skills, task counts, and Git metrics into an expertise profile.
 * @param {string} workerId - MongoDB ID of the worker
 */
const calculateDeveloperExpertise = async (workerId) => {
  const Worker = require('../models/Worker');
  const Ticket = require('../models/ticketModel');
  const Department = require('../models/Department');
  const Contributor = require('../models/Contributor');
  
  try {
    const worker = await Worker.findById(workerId);
    if (!worker) return null;
    
    // 1. Fetch task details
    const completedTickets = await Ticket.find({
      $or: [
        { assignee: worker._id },
        { assignees: { $in: [worker._id] } }
      ],
      status: 'Done',
      isDeleted: { $ne: true }
    });
    
    const activeTickets = await Ticket.find({
      $or: [
        { assignee: worker._id },
        { assignees: { $in: [worker._id] } }
      ],
      status: { $in: ['To Do', 'In Progress', 'Review'] },
      isDeleted: { $ne: true }
    });
    
    // 2. Fetch Github stats
    const contributor = await Contributor.findOne({
      $or: [
        { login: { $regex: new RegExp(`^${worker.username}$`, 'i') } },
        { name: { $regex: new RegExp(`^${worker.name}$`, 'i') } }
      ]
    });
    
    // 3. Fetch assigned departments/projects
    const assignedProjects = await Department.find({
      $or: [
        { projectLead: worker._id },
        { projectManager: worker._id },
        { assignedDevelopers: { $in: [worker._id] } }
      ]
    });
    
    const gitScore = contributor ? (contributor.score || contributor.total_contributions || 0) : 0;
    const gitCommits = contributor ? (contributor.commits || contributor.valid_commits || 0) : 0;
    const gitRepos = contributor ? (contributor.repositories || []) : [];
    
    const completedProjectNames = [...new Set(completedTickets.map(t => t.team).filter(Boolean))];
    const assignedProjectNames = assignedProjects.map(p => p.name);
    
    const expertiseProfile = {
      skills: worker.skills || [],
      completedTasksCount: completedTickets.length,
      activeTasksCount: activeTickets.length,
      gitScore,
      gitCommitsCount: gitCommits,
      gitReposCount: gitRepos.length,
      gitReposList: gitRepos,
      assignedProjectsCount: assignedProjects.length,
      assignedProjectsList: assignedProjectNames,
      historicalProjectsList: completedProjectNames
    };
    
    // Use updateOne to update fields directly and avoid save() middleware hook loops
    await Worker.updateOne(
      { _id: worker._id },
      { 
        $set: { 
          gitContributions: gitScore,
          completedTasksCount: completedTickets.length,
          activeTasksCount: activeTickets.length,
          expertiseProfile
        }
      }
    );
    
    // Construct updated worker representation for indexing
    const updatedWorker = {
      ...worker.toObject(),
      gitContributions: gitScore,
      completedTasksCount: completedTickets.length,
      activeTasksCount: activeTickets.length,
      expertiseProfile
    };
    
    await syncBrainItem('worker', updatedWorker, worker.subdomain);
    console.log(`[SecondBrain] Computed and sync'd expertise profile for worker: ${worker.name}`);
    return updatedWorker;
  } catch (error) {
    console.error(`[SecondBrain] Failed to compute developer expertise for ${workerId}:`, error.message);
    return null;
  }
};

/**
 * Removes an item from the Second Brain index.
 * @param {string} type - The item type
 * @param {string} itemId - The database ID of the original object
 * @param {string} subdomain - The company subdomain context
 */
const deleteBrainItem = async (type, itemId, subdomain) => {
  if (!subdomain || !itemId) return;
  try {
    await SecondBrainItem.deleteOne({ itemRef: itemId, subdomain });
    console.log(`[SecondBrain] Deleted ${type} item ${itemId} from index`);
  } catch (error) {
    console.error(`[SecondBrain] Failed to delete ${type} item ${itemId}:`, error.message);
  }
};

module.exports = {
  syncBrainItem,
  calculateDeveloperExpertise,
  deleteBrainItem
};
