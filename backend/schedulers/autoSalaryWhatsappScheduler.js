const cron = require('node-cron');
const Settings = require('../models/Settings');
const GowhatsConfig = require('../models/GowhatsConfig');
const { executeSalaryWhatsappDispatch } = require('../services/autoSalaryWhatsappService');

const initAutoSalaryWhatsappScheduler = () => {
  console.log('⏰ Initializing Automated WhatsApp Salary Report Scheduler (checks every 1 min)...');

  // Check every 1 minute
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      // Get India time (Asia/Kolkata)
      const indiaFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      const formatted = indiaFormatter.format(now); // "YYYY-MM-DD, HH:mm"
      const [datePart, timePart] = formatted.split(', ');
      const [yearStr, monthStr, dayStr] = datePart.split('-');
      const [hourStr, minStr] = timePart.split(':');

      const currentDay = parseInt(dayStr, 10);
      const currentMonth = parseInt(monthStr, 10);
      const currentYear = parseInt(yearStr, 10);
      const currentTimeStr = `${hourStr}:${minStr}`;

      // Check last day of current month
      const lastDayOfMonth = new Date(currentYear, currentMonth, 0).getDate();
      const isLastDay = currentDay === lastDayOfMonth;

      // Find all settings where WhatsApp automated salary dispatch is enabled
      const allSettings = await Settings.find({
        'autoSalaryWhatsappConfig.enabled': true
      });

      for (const settings of allSettings) {
        const config = settings.autoSalaryWhatsappConfig || {};
        if (!config.enabled) continue;

        // Check if numbers configured in salary settings or in GoWhats leave request config
        const gowhatsConfig = await GowhatsConfig.findOne({ subdomain: settings.subdomain });
        const hasSalaryPhones = Boolean(config.phoneNumbers && config.phoneNumbers.trim().length > 0);
        const hasGowhatsAdminPhones = Boolean(gowhatsConfig && gowhatsConfig.adminWhatsappNumbers && gowhatsConfig.adminWhatsappNumbers.length > 0);

        if (!hasSalaryPhones && !hasGowhatsAdminPhones) {
          continue;
        }

        // Determine if scheduled time matches
        const targetTime = config.dispatchTime || '09:00';
        const [targetHourStr, targetMinStr] = targetTime.split(':');
        const targetHour = parseInt(targetHourStr, 10);
        const targetMin = parseInt(targetMinStr, 10);
        const currHour = parseInt(hourStr, 10);
        const currMin = parseInt(minStr, 10);

        // Match exact minute or within 2 minutes
        const timeDiffMins = (currHour * 60 + currMin) - (targetHour * 60 + targetMin);
        const isTimeMatch = timeDiffMins >= 0 && timeDiffMins < 2;

        let isDayMatch = false;

        if (config.scheduleMode === 'end_of_month') {
          // Trigger either on the 1st of the month at 12:01 AM OR on the last day of the month
          isDayMatch = (currentDay === 1) || isLastDay;
        } else {
          // custom day mode
          if (config.customDay === 'last_day') {
            isDayMatch = isLastDay;
          } else {
            const targetDay = parseInt(config.customDay || '1', 10);
            isDayMatch = currentDay === targetDay;
          }
        }

        // Check if already dispatched for this specific scheduled slot
        if (config.lastDispatchedAt) {
          const lastDate = new Date(config.lastDispatchedAt);
          const lastDay = lastDate.getDate();
          const lastMonth = lastDate.getMonth() + 1;
          const lastYear = lastDate.getFullYear();
          const lastHour = lastDate.getHours();
          const lastMinute = lastDate.getMinutes();

          // If dispatched within the last 5 minutes, skip to avoid double execution
          const diffMs = now.getTime() - lastDate.getTime();
          if (diffMs < 5 * 60 * 1000) {
            continue;
          }
        }

        if (isDayMatch && isTimeMatch) {
          console.log(`🚀 [WhatsApp Salary Scheduler] Time matched (${currentTimeStr} == ${targetTime}, Day: ${currentDay})! Triggering dispatch for: ${settings.subdomain}`);
          const res = await executeSalaryWhatsappDispatch(settings.subdomain);
          console.log(`✅ [WhatsApp Salary Scheduler] Dispatch completed:`, res?.success ? 'SUCCESS' : res?.error);
        }
      }
    } catch (err) {
      console.error('❌ [WhatsApp Salary Scheduler Error]:', err.message);
    }
  });

  console.log('✅ Automated WhatsApp Salary Report Scheduler Active (checks every 1 min)');
};

module.exports = {
  initAutoSalaryWhatsappScheduler
};
