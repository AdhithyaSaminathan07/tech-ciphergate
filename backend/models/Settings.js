const mongoose = require('mongoose');

const settingsSchema = mongoose.Schema({
  subdomain: {
    type: String,
    required: true,
    unique: true
  },

  // Breakfast settings
  breakfastEnabled: {
    type: Boolean,
    default: false
  },
  breakfastOpenTime: {
    type: String,
    default: '07:00'
  },
  breakfastCloseTime: {
    type: String,
    default: '09:00'
  },
  breakfastAutoSwitch: {
    type: Boolean,
    default: false
  },

  // Lunch settings (existing)
  foodRequestEnabled: {
    type: Boolean,
    default: true
  },
  foodRequestOpenTime: {
    type: String,
    default: '12:00'
  },
  foodRequestCloseTime: {
    type: String,
    default: '14:00'
  },
  foodRequestAutoSwitch: {
    type: Boolean,
    default: false
  },

  // Dinner settings
  dinnerEnabled: {
    type: Boolean,
    default: false
  },
  dinnerOpenTime: {
    type: String,
    default: '18:00'
  },
  dinnerCloseTime: {
    type: String,
    default: '20:00'
  },
  dinnerAutoSwitch: {
    type: Boolean,
    default: false
  },

  // Email settings
  emailReportsEnabled: {
    type: Boolean,
    default: false
  },
  lastEmailSent: {
    type: Date
  },
  emailSentToday: {
    type: Boolean,
    default: false
  },

  // Attendance and productivity settings
  considerOvertime: {
    type: Boolean,
    default: false
  },
  deductSalary: {
    type: Boolean,
    default: true
  },
  permissionTimeMinutes: {
    type: Number,
    default: 15
  },
  salaryDeductionPerBreak: {
    type: Number,
    default: 10
  },

  // Location settings for attendance restrictions
  attendanceLocation: {
    enabled: {
      type: Boolean,
      default: false
    },
    latitude: {
      type: Number,
      default: 0,
      validate: {
        validator: function (v) {
          return v >= -90 && v <= 90;
        },
        message: props => `${props.value} is not a valid latitude! Must be between -90 and 90.`
      }
    },
    longitude: {
      type: Number,
      default: 0,
      validate: {
        validator: function (v) {
          return v >= -180 && v <= 180;
        },
        message: props => `${props.value} is not a valid longitude! Must be between -180 and 180.`
      }
    },
    radius: {
      type: Number, // in meters
      default: 100,
      validate: {
        validator: function (v) {
          return v >= 10 && v <= 1000;
        },
        message: props => `${props.value} is not a valid radius! Must be between 10 and 1000 meters.`
      }
    }
  },

  // Attendance Access Control
  attendanceAccessControl: {
    admin: {
      addAttendance: {
        type: Boolean,
        default: true
      },
      faceAttendance: {
        type: Boolean,
        default: true
      }
    },
    employee: {
      rfidAttendance: {
        type: Boolean,
        default: true
      },
      faceAttendance: {
        type: Boolean,
        default: true
      }
    }
  },

  // Advanced Leave Deduction Settings
  advancedLeaveDeduction: {
    attendanceRuleEnabled: {
      type: Boolean,
      default: false
    },
    monthlyLimitRuleEnabled: {
      type: Boolean,
      default: false
    },
    thresholds: {
      company: {
        value: { type: Number, default: 80, min: 0, max: 100 },
        enabled: { type: Boolean, default: true }
      },
      department: {
        value: { type: Number, default: 80, min: 0, max: 100 },
        enabled: { type: Boolean, default: true }
      },
      employee: {
        value: { type: Number, default: 90, min: 0, max: 100 },
        enabled: { type: Boolean, default: true }
      }
    },
    monthlyLimit: {
      type: Number,
      default: 2,
      min: 0
    },
    deductionMultiplier: {
      type: Number,
      default: 2,
      min: 1
    },
    includePermissionPenalty: {
      type: Boolean,
      default: false
    },
    enableUnauthorizedLeavePenalty: {
      type: Boolean,
      default: true
    },
    enableUnauthorizedPermissionPenalty: {
      type: Boolean,
      default: false
    }
  },

  // Common fields
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },

  // Batches and intervals
  batches: {
    type: [
      {
        batchName: {
          type: String,
          required: true
        },
        from: {
          type: String,
          default: '09:00'
        },
        to: {
          type: String,
          default: '19:00'
        },
        lunchFrom: {
          type: String,
          default: '13:30'
        },
        lunchTo: {
          type: String,
          default: '14:30'
        },
        isLunchConsider: {
          type: Boolean,
          default: false
        },
        isFactoryWorkerToggle: {
          type: Boolean,
          default: false
        },
        requiredWorkingHours: {
          type: Number,
          default: 8
        },
        allowedFreeLunchHours: {
          type: Number,
          default: 1
        }
      }
    ],
    default: [
      {
        batchName: 'Full Time',
        from: '09:00',
        to: '19:00',
        lunchFrom: '13:30',
        lunchTo: '14:30',
        isLunchConsider: false,
        isFactoryWorkerToggle: false,
        requiredWorkingHours: 8,
        allowedFreeLunchHours: 1
      }
    ]
  },

  intervals: {
    type: [
      {
        intervalName: {
          type: String,
          default: 'interval1'
        },
        from: {
          type: String,
          default: '10:15'
        },
        to: {
          type: String,
          default: '10:30'
        },
        isBreakConsider: {
          type: Boolean,
          default: false
        }
      }
    ],
    default: [
      {
        intervalName: 'interval1',
        from: '10:15',
        to: '10:30',
        isBreakConsider: false
      },
      {
        intervalName: 'interval2',
        from: '14:15',
        to: '14:30',
        isBreakConsider: false
      }
    ]
  },
  includePermission: {
    type: Boolean,
    default: false
  },
  // Paid Leave Configuration
  paidLeaveConfig: {
    enabled: {
      type: Boolean,
      default: false
    },
    leavesPerMonth: {
      type: Number,
      default: 1
    }
  },
  // Rules and Regulations Configuration
  rulesConfiguration: {
    forceAcceptance: {
      type: Boolean,
      default: true
    },
    scrollValidation: {
      type: Boolean,
      default: true
    },
    allowPdfDownload: {
      type: Boolean,
      default: true
    },
    requireCheckbox: {
      type: Boolean,
      default: true
    },
    autoNotify: {
      type: Boolean,
      default: true
    },
    gracePeriodDays: {
      type: Number,
      default: 0
    },
    mobileAcceptance: {
      type: Boolean,
      default: true
    },
    currentVersion: {
      type: String,
      default: '1.0'
    }
  },

  // Performance & Rewards Configuration
  performanceConfig: {
    enabled: { type: Boolean, default: true },
    basePoints: { type: Number, default: 1 },
    advancedMode: { type: Boolean, default: false },
    penaltyEnabled: { type: Boolean, default: true },
    penaltyPercentage: { type: Number, default: 50 },
    earlyBonusEnabled: { type: Boolean, default: true },
    streakBonusEnabled: { type: Boolean, default: true },
    badgeSystemEnabled: { type: Boolean, default: true },
    leaderboardVisible: { type: Boolean, default: true },
    priorityMultipliers: {
      Low: { type: Number, default: 1 },
      Medium: { type: Number, default: 1.5 },
      High: { type: Number, default: 2 },
      Critical: { type: Number, default: 3 }
    },
    typeMultipliers: {
      Task: { type: Number, default: 1 },
      Bug: { type: Number, default: 1.5 },
      Story: { type: Number, default: 2 },
      Epic: { type: Number, default: 3 }
    }
  },

  // AI and Second Brain Configuration
  aiConfig: {
    deepseekApiKey: {
      type: String,
      default: ''
    },
    claudeApiKey: {
      type: String,
      default: ''
    },
    aiMaxDailyRequests: {
      type: Number,
      default: 100
    },
    aiMaxMonthlyRequests: {
      type: Number,
      default: 1000
    },
    aiDailyRequestCount: {
      type: Number,
      default: 0
    },
    aiMonthlyRequestCount: {
      type: Number,
      default: 0
    },
    aiLastResetDate: {
      type: Date,
      default: Date.now
    },
    aiFeaturesEnabled: {
      type: Boolean,
      default: true
    }
  },

  bugBountyConfig: {
    enabled: {
      type: Boolean,
      default: true
    },
    bugReportUrl: {
      type: String,
      default: 'https://techvaseegrah.com/bug-bounty'
    },
    disclosureMessage: {
      type: String,
      default: 'Visit to check the bug bounty to earn for each bug 1000'
    },
    popupFrequency: {
      type: String,
      enum: ['always', 'once', 'every_day', 'every_week', 'every_month', 'disabled'],
      default: 'every_day'
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },

  // Unread WhatsApp Message Fine (SLA penalty for staff)
  unreadMessageFineConfig: {
    enabled: {
      type: Boolean,
      default: false
    },
    amountPerMessage: {
      type: Number,
      default: 0,
      min: 0
    },
    thresholdHours: {
      type: Number,
      default: 24,
      min: 1
    }
  },

  // Face Recognition Configuration
  faceRecognition: {
    detectorType: {
      type: String,
      enum: ['ssdMobilenetv1', 'tinyFaceDetector'],
      default: 'tinyFaceDetector'
    },
    matchingThreshold: {
      type: Number,
      default: 0.50,
      min: 0.1,
      max: 0.9
    }
  },

  // Automated WhatsApp Salary Report Configuration
  autoSalaryWhatsappConfig: {
    enabled: {
      type: Boolean,
      default: false
    },
    scheduleMode: {
      type: String,
      enum: ['end_of_month', 'custom'],
      default: 'end_of_month'
    },
    customDay: {
      type: String,
      default: 'last_day'
    },
    dispatchTime: {
      type: String,
      default: '00:01'
    },
    phoneNumbers: {
      type: String,
      default: ''
    },
    lastDispatchedAt: {
      type: Date
    }
  },

  // Payment & Bank Details Configuration
  paymentDetails: {
    bankName: {
      type: String,
      default: 'ICICI'
    },
    accountNumber: {
      type: String,
      default: '612805036053'
    },
    ifscCode: {
      type: String,
      default: 'ICIC0006128'
    },
    upiId: {
      type: String,
      default: 'techvaseegrah.ibz@icici'
    },
    companyName: {
      type: String,
      default: 'TECH VASEEGRAH'
    }
  }

}, {
  timestamps: true
});


// Method to reset daily email flag
settingsSchema.methods.resetDailyEmailFlag = function () {
  const today = new Date();
  const lastSent = this.lastEmailSent;

  if (!lastSent || lastSent.toDateString() !== today.toDateString()) {
    this.emailSentToday = false;
    return true;
  }
  return false;
};

module.exports = mongoose.model('Settings', settingsSchema);