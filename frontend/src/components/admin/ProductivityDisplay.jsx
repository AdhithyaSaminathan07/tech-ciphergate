import React from 'react';
import { 
  FaClock, 
  FaUserClock, 
  FaChartLine, 
  FaCalendarCheck, 
  FaMoneyBillWave, 
  FaUserCheck,
  FaTrophy,
  FaExclamationTriangle
} from 'react-icons/fa';

const ProductivityDisplay = ({ productivityData }) => {
  // Helper function to convert minutes to hours and minutes display
  const formatMinutesToHoursMin = (minutes) => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return `${hours}hrs ${mins}min`;
  };

  // Helper function to convert decimal hours to hours and minutes
  const formatDecimalHoursToHoursMin = (decimalHours) => {
    const hours = Math.floor(decimalHours);
    const mins = Math.round((decimalHours - hours) * 60);
    return `${hours}hrs ${mins}min`;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Total Working Hours */}
      <ProductivityCard
        title="Total Working Hours"
        value={formatDecimalHoursToHoursMin(productivityData.totalWorkingHours)}
        icon={FaClock}
        bgColor="bg-blue-50"
        textColor="text-blue-600"
        subtitle={`Avg: ${formatDecimalHoursToHoursMin(productivityData.averageWorkingHours)} per day`}
      />

      {/* Permission Time */}
      <ProductivityCard
        title="Permission Time"
        value={formatMinutesToHoursMin(productivityData.totalPermissionTime)}
        icon={FaUserClock}
        bgColor="bg-yellow-50"
        textColor="text-yellow-600"
        subtitle={`Over ${productivityData.totalDays} days`}
      />

      {/* Productivity Percentage */}
      {/* <ProductivityCard
        title="Productivity"
        value={`${productivityData.productivityPercentage.toFixed(3)}%`}
        icon={FaChartLine}
        bgColor="bg-green-50"
        textColor="text-green-600"
        subtitle="Overall efficiency"
      /> */}

      {/* Punctuality Score */}
      {/* <ProductivityCard
        title="Punctuality"
        value={`${productivityData.summary.punctualityScore.toFixed(3)}%`}
        icon={FaUserCheck}
        bgColor="bg-purple-50"
        textColor="text-purple-600"
        subtitle="On-time performance"
      /> */}

      {/* Attendance Rate */}
      {/* <ProductivityCard
        title="Attendance"
        value={`${productivityData.summary.attendanceRate.toFixed(3)}%`}
        icon={FaCalendarCheck}
        bgColor="bg-indigo-50"
        textColor="text-indigo-600"
        subtitle={`${productivityData.workingDays}/${productivityData.totalDays} days`}
      /> */}

      {/* Salary Status */}
      <ProductivityCard
        title="Final Salary"
        value={`₹${productivityData.summary.finalSalary.toFixed(3).toLocaleString()}`}
        icon={FaMoneyBillWave}
        bgColor={productivityData.totalSalaryDeduction > 0 ? "bg-red-50" : "bg-green-50"}
        textColor={productivityData.totalSalaryDeduction > 0 ? "text-red-600" : "text-green-600"}
        // subtitle={
        //   productivityData.totalSalaryDeduction > 0 
        //     ? `Deduction: ₹${productivityData.totalSalaryDeduction.toFixed(3)}`
        //     : "No deductions"
        // }
        subtitle={'Final salary of selected dates'}
      />

      {/* Performance Rating */}
      {/* <ProductivityCard
        title="Performance"
        value={
          productivityData.productivityPercentage >= 95 ? "Excellent" :
          productivityData.productivityPercentage >= 85 ? "Good" :
          productivityData.productivityPercentage >= 75 ? "Average" : "Needs Improvement"
        }
        icon={FaTrophy}
        bgColor={
          productivityData.productivityPercentage >= 95 ? "bg-emerald-50" :
          productivityData.productivityPercentage >= 85 ? "bg-blue-50" :
          productivityData.productivityPercentage >= 75 ? "bg-yellow-50" : "bg-red-50"
        }
        textColor={
          productivityData.productivityPercentage >= 95 ? "text-emerald-600" :
          productivityData.productivityPercentage >= 85 ? "text-blue-600" :
          productivityData.productivityPercentage >= 75 ? "text-yellow-600" : "text-red-600"
        }
        subtitle={`${productivityData.productivityPercentage.toFixed(3)}% efficiency`}
      /> */}

      {/* Issue Alert (if any) */}
      {(productivityData.totalSalaryDeduction > 0 || productivityData.totalPermissionTime > 60) && (
        <ProductivityCard
          title="Alerts"
          value={
            productivityData.totalSalaryDeduction > 0 
              ? `₹${productivityData.totalSalaryDeduction.toFixed(3)}`
              : "Permission Time High"
          }
          icon={FaExclamationTriangle}
          bgColor="bg-orange-50"
          textColor="text-orange-600"
          subtitle="Date-Specific Salary Adjustment (Deducted/Remaining)"
        />
      )}
    </div>
  );
};

// Enhanced ProductivityCard component (if you want to add subtitle support)
const ProductivityCard = ({ 
  title, 
  value, 
  icon: Icon, 
  bgColor, 
  textColor, 
  subtitle 
}) => {
  return (
    <div className={`${bgColor} p-6 rounded-lg shadow-sm border border-gray-100`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          <p className={`text-2xl font-bold ${textColor} mb-1`}>{value}</p>
          {subtitle && (
            <p className="text-xs text-gray-500">{subtitle}</p>
          )}
        </div>
        <div className={`${textColor} opacity-80`}>
          <Icon size={24} />
        </div>
      </div>
    </div>
  );
};

// Usage example:
/*
const YourComponent = () => {
  const [productivityData, setProductivityData] = useState(null);

  useEffect(() => {
    // Your productivity calculation
    const result = calculateWorkerProductivity(attendanceData, fromDate, toDate);
    setProductivityData(result);
  }, []);

  return (
    <div>
      {productivityData && (
        <ProductivityDisplay productivityData={productivityData} />
      )}
    </div>
  );
};
*/

export default ProductivityDisplay;