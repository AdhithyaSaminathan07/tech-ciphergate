const cron = require('node-cron');
const Settings = require('../models/Settings');
const { executeSalaryWhatsappDispatch } = require('../services/autoSalaryWhatsappService');

const initAutoSalaryWhatsappScheduler = () => {
  console.log('⏰ Initializing Automated WhatsApp Salary Report Scheduler...');

  // Check every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
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
        if (!config.enabled || !config.phoneNumbers) continue;

        // Check if already dispatched for this month & year
        if (config.lastDispatchedAt) {
          const lastDate = new Date(config.lastDispatchedAt);
          const lastMonth = lastDate.getMonth() + 1;
          const lastYear = lastDate.getFullYear();
          if (lastMonth === currentMonth && lastYear === currentYear) {
            // Already dispatched for this month
            continue;
          }
        }

        // Determine if scheduled time matches
        const targetTime = config.dispatchTime || '00:01';
        const [targetHourStr, targetMinStr] = targetTime.split(':');
        const targetHour = parseInt(targetHourStr, 10);
        const targetMin = parseInt(targetMinStr, 10);
        const currHour = parseInt(hourStr, 10);
        const currMin = parseInt(minStr, 10);

        // Allow a 10-minute window for the cron job to catch the scheduled time
        const timeDiffMins = (currHour * 60 + currMin) - (targetHour * 60 + targetMin);
        const isTimeMatch = timeDiffMins >= 0 && timeDiffMins < 10;

        let isDayMatch = false;

        if (config.scheduleMode === 'end_of_month') {
          // Trigger either on the 1st of the month at 12:01 AM OR on the last day of the month
          isDayMatch = (currentDay === 1) || isLastDay;
        } else if (config.scheduleMode === 'custom') {
          if (config.customDay === 'last_day') {
            isDayMatch = isLastDay;
          } else {
            const targetDay = parseInt(config.customDay, 10);
            isDayMatch = currentDay === targetDay;
          }
        }

        if (isDayMatch && isTimeMatch) {
          console.log(`🚀 [WhatsApp Salary Scheduler] Triggering automatic dispatch for tenant: ${settings.subdomain}`);
          const res = await executeSalaryWhatsappDispatch(settings.subdomain);
          console.log(`✅ [WhatsApp Salary Scheduler] Dispatch result:`, res);
        }
      }
    } catch (err) {
      console.error('❌ [WhatsApp Salary Scheduler Error]:', err.message);
    }
  });

  console.log('✅ Automated WhatsApp Salary Report Scheduler Active (checks every 5 mins)');
};

module.exports = {
  initAutoSalaryWhatsappScheduler
};
