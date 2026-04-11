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