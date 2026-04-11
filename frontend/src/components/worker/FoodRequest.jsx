// src/components/worker/FoodRequest.jsx
import { useState, useEffect, useContext } from 'react';
import { toast } from 'react-toastify';
import { AuthContext } from '../../context/AuthContext';
import { submitFoodRequest, getFoodRequestSettings } from '../../services/foodRequestService';
import Button from '../common/Button';
import Card from '../common/Card';
import Spinner from '../common/Spinner';
import appContext from '../../context/AppContext';

const FoodRequest = () => {
  const { user } = useContext(AuthContext);
  const { subdomain } = useContext(appContext);
  const [loading, setLoading] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState('');
  const [submitted, setSubmitted] = useState({
    breakfast: false,
    lunch: false,
    dinner: false
  });
  const [submittedTimes, setSubmittedTimes] = useState({
    breakfast: null,
    lunch: null,
    dinner: null
  });
  const [settings, setSettings] = useState({
    breakfast: { enabled: false, openTime: '07:00', closeTime: '09:00', autoSwitch: false },
    lunch: { enabled: true, openTime: '12:00', closeTime: '14:00', autoSwitch: false },
    dinner: { enabled: false, openTime: '18:00', closeTime: '20:00', autoSwitch: false }
  });

  useEffect(() => {
    const checkSubmissionStatus = async () => {
      try {
        if (user && subdomain) {
          // Check local storage for today's submissions
          const today = new Date().toDateString();
          const meals = ['breakfast', 'lunch', 'dinner'];
          const newSubmitted = {};
          const newSubmittedTimes = {};

          meals.forEach(meal => {
            const storageKey = `foodRequestSubmitted_${meal}_${user._id}`;
            const storedData = localStorage.getItem(storageKey);
            
            if (storedData) {
              const { date, time } = JSON.parse(storedData);
              if (date === today) {
                newSubmitted[meal] = true;
                newSubmittedTimes[meal] = time;
              } else {
                localStorage.removeItem(storageKey);
                newSubmitted[meal] = false;
                newSubmittedTimes[meal] = null;
              }
            } else {
              newSubmitted[meal] = false;
              newSubmittedTimes[meal] = null;
            }
          });

          setSubmitted(newSubmitted);
          setSubmittedTimes(newSubmittedTimes);
          
          // Fetch settings
          const fetchedSettings = await getFoodRequestSettings({ subdomain });
          setSettings(fetchedSettings);
        }
      } catch (error) {
        console.error('Error checking food request status:', error);
        toast.error('Failed to load food request status');
      }
    };
    
    if (user && subdomain) {
      checkSubmissionStatus();
      // Set interval to check regularly for auto-switch
      const interval = setInterval(() => {
        checkSubmissionStatus();
      }, 60000); // Check every minute
      
      return () => clearInterval(interval);
    }
  }, [user, subdomain]);

  const handleSubmit = async () => {
    if (!selectedMeal) {
      toast.error('Please select a meal type');
      return;
    }

    setLoading(true);
    try {
      await submitFoodRequest({ 
        subdomain, 
        mealType: selectedMeal 
      });
      
      const now = new Date();
      const timeString = now.toLocaleTimeString();
      
      const storageKey = `foodRequestSubmitted_${selectedMeal}_${user._id}`;
      localStorage.setItem(storageKey, JSON.stringify({
        date: now.toDateString(),
        time: timeString
      }));
      
      setSubmitted(prev => ({ ...prev, [selectedMeal]: true }));
      setSubmittedTimes(prev => ({ ...prev, [selectedMeal]: timeString }));
      setSelectedMeal('');
      
      toast.success(`${selectedMeal.charAt(0).toUpperCase() + selectedMeal.slice(1)} request submitted successfully!`);
    } catch (error) {
      toast.error(error.message || 'Failed to submit food request');
    } finally {
      setLoading(false);
    }
  };

  // Format time to 12-hour format for display
  const formatTimeTo12Hour = (time24) => {
    if (!time24) return '';
    
    const [hours, minutes] = time24.split(':');
    const hour = parseInt(hours, 10);
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    
    return `${hour12}:${minutes} ${period}`;
  };

  // Check if meal is currently available
  const isMealAvailable = (mealType) => {
    const mealSettings = settings[mealType];
    if (!mealSettings) return false;

    if (mealSettings.autoSwitch) {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      return currentTime >= mealSettings.openTime && currentTime < mealSettings.closeTime;
    }
    
    return mealSettings.enabled;
  };

  const getMealStatus = (mealType) => {
    const mealSettings = settings[mealType];
    if (!mealSettings) return 'Not Available';

    if (submitted[mealType]) return 'Submitted';
    if (!mealSettings.enabled && !mealSettings.autoSwitch) return 'Disabled';
    if (mealSettings.autoSwitch && !isMealAvailable(mealType)) return 'Closed';
    return 'Available';
  };

  const getMealStatusColor = (mealType) => {
    const status = getMealStatus(mealType);
    switch (status) {
      case 'Submitted': return 'bg-green-100 text-green-800';
      case 'Available': return 'bg-blue-100 text-blue-800';
      case 'Closed': return 'bg-orange-100 text-orange-800';
      case 'Disabled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="space-y-6">
      {/* Meal Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {['breakfast', 'lunch', 'dinner'].map(meal => (
          <Card key={meal} className="text-center">
            <h3 className="text-lg font-semibold mb-2 capitalize">{meal}</h3>
            <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-2 ${getMealStatusColor(meal)}`}>
              {getMealStatus(meal)}
            </div>
            <div className="text-sm text-gray-600">
              {formatTimeTo12Hour(settings[meal]?.openTime)} - {formatTimeTo12Hour(settings[meal]?.closeTime)}
            </div>
            {submitted[meal] && submittedTimes[meal] && (
              <div className="text-xs text-gray-500 mt-1">
                Submitted at: {submittedTimes[meal]}
              </div>
            )}
          </Card>
        ))}
      </div>

      {/* Submit New Request */}
      <Card className="max-w-lg mx-auto">
        <h2 className="text-xl font-bold mb-4">Submit Food Request</h2>
        
        {/* Meal Selection */}
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Select Meal</label>
          <select
            value={selectedMeal}
            onChange={(e) => setSelectedMeal(e.target.value)}
            className="w-full p-2 border rounded-md"
            disabled={loading}
          >
            <option value="">Choose a meal...</option>
            {['breakfast', 'lunch', 'dinner'].map(meal => {
              const isAvailable = isMealAvailable(meal);
              const isSubmitted = submitted[meal];
              const isDisabled = !isAvailable || isSubmitted;
              
              return (
                <option 
                  key={meal} 
                  value={meal} 
                  disabled={isDisabled}
                >
                  {meal.charAt(0).toUpperCase() + meal.slice(1)} 
                  {isSubmitted ? ' (Already Submitted)' : 
                   !isAvailable ? ' (Not Available)' : ''}
                </option>
              );
            })}
          </select>
        </div>

        {/* Submit Button */}
        <Button 
          onClick={handleSubmit} 
          disabled={loading || !selectedMeal}
          variant="primary"
          className="w-full"
        >
          {loading ? <Spinner size="sm" /> : `Request ${selectedMeal ? selectedMeal.charAt(0).toUpperCase() + selectedMeal.slice(1) : 'Food'}`}
        </Button>

        {/* Help Text */}
        {selectedMeal && (
          <div className="mt-4 p-3 bg-blue-50 rounded-md">
            <p className="text-sm text-blue-800">
              You are requesting {selectedMeal}. Available between {' '}
              {formatTimeTo12Hour(settings[selectedMeal]?.openTime)} - {formatTimeTo12Hour(settings[selectedMeal]?.closeTime)}
            </p>
          </div>
        )}
      </Card>
    </div>
  );
};

export default FoodRequest;