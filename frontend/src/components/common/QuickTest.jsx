// Quick Test Component for unregistered users
import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import Button from '../common/Button';
import Modal from '../common/Modal';
import Card from '../common/Card';
import { FaClock, FaPlay, FaStop, FaCheckCircle, FaTimesCircle, FaRobot, FaShieldAlt, FaEye } from 'react-icons/fa';

const QuickTest = () => {
    const [step, setStep] = useState('setup'); // 'setup', 'test', 'result'
    const [formData, setFormData] = useState({
        name: '',
        password: '',
        topic: '',
        numQuestions: 10,
        difficulty: 'Medium'
    });
    const [testData, setTestData] = useState(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState([]);
    const [timeLeft, setTimeLeft] = useState(0);
    const [totalTimeLeft, setTotalTimeLeft] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [fullscreenExits, setFullscreenExits] = useState(0);
    const [showWarning, setShowWarning] = useState(false);
    const [testResults, setTestResults] = useState(null);
    const [loading, setLoading] = useState(false);
    const timerRef = useRef(null);
    const totalTimerRef = useRef(null);

    // Fullscreen and anti-cheat logic
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isCurrentlyFullscreen = !!document.fullscreenElement;
            setIsFullscreen(isCurrentlyFullscreen);
            
            if (step === 'test' && !isCurrentlyFullscreen) {
                setFullscreenExits(prev => prev + 1);
                
                if (fullscreenExits === 0) {
                    // First exit - show warning
                    setShowWarning(true);
                    pauseTest();
                } else {
                    // Second exit - auto submit
                    handleSubmitTest();
                }
            }
        };

        document.addEventListener('fullscreenchange', handleFullscreenChange);
        
        // Disable right-click and copy/paste during test
        const handleContextMenu = (e) => {
            if (step === 'test') e.preventDefault();
        };
        
        const handleKeyDown = (e) => {
            if (step === 'test') {
                // Disable F12, Ctrl+Shift+I, Ctrl+U, Ctrl+C, Ctrl+V, etc.
                if (e.key === 'F12' || 
                    (e.ctrlKey && (e.key === 'u' || e.key === 'U')) ||
                    (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) ||
                    (e.ctrlKey && (e.key === 'c' || e.key === 'C')) ||
                    (e.ctrlKey && (e.key === 'v' || e.key === 'V'))) {
                    e.preventDefault();
                }
            }
        };

        document.addEventListener('contextmenu', handleContextMenu);
        document.addEventListener('keydown', handleKeyDown);
        
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('contextmenu', handleContextMenu);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [step, fullscreenExits]);

    // Question timer
    useEffect(() => {
        if (step === 'test' && timeLeft > 0 && isFullscreen) {
            timerRef.current = setTimeout(() => {
                setTimeLeft(prev => prev - 1);
            }, 1000);
        } else if (timeLeft === 0 && step === 'test') {
            handleNextQuestion();
        }
        
        return () => clearTimeout(timerRef.current);
    }, [timeLeft, step, isFullscreen]);

    // Total test timer
    useEffect(() => {
        if (step === 'test' && totalTimeLeft > 0 && isFullscreen) {
            totalTimerRef.current = setTimeout(() => {
                setTotalTimeLeft(prev => prev - 1);
            }, 1000);
        } else if (totalTimeLeft === 0 && step === 'test') {
            handleSubmitTest();
        }
        
        return () => clearTimeout(totalTimerRef.current);
    }, [totalTimeLeft, step, isFullscreen]);

    const startQuickTest = async () => {
        if (!formData.name || !formData.password || !formData.topic) {
            alert('Please fill in all required fields');
            return;
        }

        try {
            setLoading(true);
            const response = await api.post('/test/questions/quick-test', {
                name: formData.name,
                password: formData.password,
                topic: formData.topic,
                numQuestions: parseInt(formData.numQuestions),
                difficulty: formData.difficulty
            });

            setTestData(response.data);
            setCurrentQuestionIndex(0);
            setAnswers(new Array(response.data.questions.length).fill(null));
            setTimeLeft(response.data.durationPerQuestion);
            setTotalTimeLeft(response.data.totalTestDuration);
            setStep('test');
            
            // Enter fullscreen
            await document.documentElement.requestFullscreen();
        } catch (error) {
            console.error('Error starting quick test:', error);
            alert('Error starting test: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleAnswerSelect = (optionIndex) => {
        const newAnswers = [...answers];
        newAnswers[currentQuestionIndex] = optionIndex;
        setAnswers(newAnswers);
    };

    const handleNextQuestion = () => {
        if (currentQuestionIndex < testData.questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
            setTimeLeft(testData.durationPerQuestion);
        } else {
            handleSubmitTest();
        }
    };

    const pauseTest = () => {
        // Pause timers when showing warning
        clearTimeout(timerRef.current);
        clearTimeout(totalTimerRef.current);
    };

    const resumeTest = async () => {
        setShowWarning(false);
        await document.documentElement.requestFullscreen();
    };

    const handleSubmitTest = async () => {
        try {
            setLoading(true);
            
            // Exit fullscreen
            if (document.fullscreenElement) {
                await document.exitFullscreen();
            }

            const submissionData = testData.questions.map((question, index) => ({
                questionId: question._id,
                selectedOption: answers[index] !== null ? answers[index] : -1
            }));

            const response = await api.post(`/test/quick-test/submit/${testData.quickTestId}`, {
                answers: submissionData
            });

            setTestResults(response.data);
            setStep('result');
        } catch (error) {
            console.error('Error submitting test:', error);
            alert('Error submitting test: ' + (error.response?.data?.message || error.message));
        } finally {
            setLoading(false);
        }
    };

    const resetTest = () => {
        setStep('setup');
        setFormData({
            name: '',
            password: '',
            topic: '',
            numQuestions: 10,
            difficulty: 'Medium'
        });
        setTestData(null);
        setCurrentQuestionIndex(0);
        setAnswers([]);
        setTimeLeft(0);
        setTotalTimeLeft(0);
        setFullscreenExits(0);
        setShowWarning(false);
        setTestResults(null);
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    if (step === 'setup') {
        return (
            <div className="min-h-screen bg-gray-100 py-8">
                <div className="max-w-2xl mx-auto">
                    <div className="bg-white p-8 rounded-lg shadow-lg">
                        <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">
                            Quick Test
                        </h1>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Your Name *
                                </label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Enter your full name"
                                    value={formData.name}
                                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Password *
                                </label>
                                <input
                                    type="password"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="Enter a password for this session"
                                    value={formData.password}
                                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                    Test Topic *
                                </label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="e.g., JavaScript, Mathematics, General Knowledge"
                                    value={formData.topic}
                                    onChange={(e) => setFormData({...formData, topic: e.target.value})}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Number of Questions
                                    </label>
                                    <select
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={formData.numQuestions}
                                        onChange={(e) => setFormData({...formData, numQuestions: e.target.value})}
                                    >
                                        <option value={5}>5 Questions</option>
                                        <option value={10}>10 Questions</option>
                                        <option value={15}>15 Questions</option>
                                        <option value={20}>20 Questions</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-2">
                                        Difficulty Level
                                    </label>
                                    <select
                                        className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        value={formData.difficulty}
                                        onChange={(e) => setFormData({...formData, difficulty: e.target.value})}
                                    >
                                        <option value="Easy">Easy</option>
                                        <option value="Medium">Medium</option>
                                        <option value="Hard">Hard</option>
                                    </select>
                                </div>
                            </div>

                            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                                <h3 className="font-semibold text-yellow-800 mb-2">Important Notes:</h3>
                                <ul className="text-sm text-yellow-700 space-y-1">
                                    <li>• The test will start in fullscreen mode</li>
                                    <li>• Exiting fullscreen once will show a warning</li>
                                    <li>• Exiting fullscreen twice will auto-submit the test</li>
                                    <li>• Copy/paste and developer tools are disabled</li>
                                    <li>• Make sure you have a stable internet connection</li>
                                </ul>
                            </div>

                            <Button
                                onClick={startQuickTest}
                                disabled={loading}
                                className="w-full py-4 text-lg"
                            >
                                {loading ? 'Starting Test...' : 'Start Test'}
                                <FaPlay className="ml-2" />
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (step === 'test' && testData) {
        const currentQuestion = testData.questions[currentQuestionIndex];
        const progress = ((currentQuestionIndex + 1) / testData.questions.length) * 100;

        return (
            <div className="min-h-screen bg-gray-900 text-white p-8">
                <div className="max-w-4xl mx-auto">
                    {/* Header */}
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h1 className="text-2xl font-bold">Quick Test - {formData.topic}</h1>
                            <p className="text-gray-300">Question {currentQuestionIndex + 1} of {testData.questions.length}</p>
                        </div>
                        <div className="text-right">
                            <div className="text-sm text-gray-300">Question Time</div>
                            <div className="text-2xl font-bold text-yellow-400">
                                <FaClock className="inline mr-2" />
                                {formatTime(timeLeft)}
                            </div>
                            <div className="text-sm text-gray-300 mt-2">Total Time: {formatTime(totalTimeLeft)}</div>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-gray-700 rounded-full h-2 mb-8">
                        <div 
                            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>

                    {/* Question */}
                    <div className="bg-gray-800 p-8 rounded-lg mb-8">
                        {currentQuestion.questionFormat === 'upsc' ? (
                            // UPSC/GK Style Question Format
                            <div className="mb-6">
                                <h2 className="text-xl font-semibold mb-4 whitespace-pre-line">
                                    {currentQuestion.questionText}
                                </h2>
                                <div className="space-y-2 mt-4">
                                    {currentQuestion.options.map((option, index) => {
                                        // Determine styling based on the selected answer
                                        let divStyle = 'p-3 bg-gray-700 rounded-lg cursor-pointer hover:bg-gray-600';
                                        
                                        // When an answer is selected
                                        if (answers[currentQuestionIndex] === index) {
                                            divStyle = 'p-3 bg-blue-900 rounded-lg border-2 border-blue-500';
                                        }
                                        
                                        return (
                                            <div 
                                                key={index} 
                                                className={divStyle}
                                                onClick={() => handleAnswerSelect(index)}
                                            >
                                                <span className="font-medium mr-3">{String.fromCharCode(65 + index)}.</span>
                                                {option}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ) : (
                            // Standard MCQ Format
                            <>
                                <h2 className="text-xl font-semibold mb-6">{currentQuestion.questionText}</h2>
                                {/* Define correctAnswerIndex in a higher scope */}
                                {(() => {
                                    const correctAnswerIndex = typeof currentQuestion.correctOption === 'number' 
                                        ? currentQuestion.correctOption 
                                        : (typeof currentQuestion.correctAnswer === 'number' ? currentQuestion.correctAnswer : 0);
                                    
                                    return (
                                        <div className="space-y-4">
                                            {currentQuestion.options.map((option, index) => {
                                                // Determine styling based on the selected answer and feedback state
                                                let buttonStyle = 'border-gray-600 bg-gray-700 hover:border-blue-500 hover:bg-gray-600';
                                                let iconMarkup = null;
                                                
                                                // When showing feedback after answer selection
                                                if (showFeedback) {
                                                    // Highlight the correct answer in green regardless of what was selected
                                                    if (index === correctAnswerIndex) {
                                                        buttonStyle = 'border-green-500 bg-green-700 text-green-100';
                                                        iconMarkup = <span className="float-right text-green-400 font-bold">✓ CORRECT</span>;
                                                    }
                                                    
                                                    // If this is the selected answer and it's wrong
                                                    if (selectedAnswerIndex === index && index !== correctAnswerIndex) {
                                                        buttonStyle = 'border-orange-500 bg-orange-900 text-orange-100';
                                                        iconMarkup = <span className="float-right text-orange-400 font-bold">✗ WRONG</span>;
                                                    }
                                                } 
                                                // When not showing feedback but an answer is selected
                                                else if (answers[currentQuestionIndex] === index) {
                                                    buttonStyle = 'border-blue-500 bg-blue-900 text-blue-100 transform scale-105';
                                                }
                                                
                                                return (
                                                    <button
                                                        key={index}
                                                        className={`w-full p-4 text-left rounded-lg border-2 transition-all duration-300 hover:scale-105 ${buttonStyle}`}
                                                        onClick={() => handleAnswerSelect(index)}
                                                        disabled={selectedAnswerIndex !== null || answers[currentQuestionIndex] !== null}
                                                    >
                                                        <span className="font-medium mr-3">{String.fromCharCode(65 + index)}.</span>
                                                        {option}
                                                        {iconMarkup}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}
                            </>
                        )}
                    </div>

                    {/* Navigation */}
                    <div className="flex justify-between items-center">
                        <div className="text-sm text-gray-400">
                            {answers[currentQuestionIndex] !== null ? 'Answer selected' : 'Select an answer'}
                        </div>
                        <div className="space-x-4">
                            <Button
                                onClick={handleNextQuestion}
                                disabled={answers[currentQuestionIndex] === null}
                            >
                                {currentQuestionIndex < testData.questions.length - 1 ? 'Next Question' : 'Submit Test'}
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Warning Modal */}
                <Modal
                    isOpen={showWarning}
                    onClose={() => {}}
                    title="⚠️ Fullscreen Exit Warning"
                >
                    <div className="text-center py-4">
                        <p className="text-gray-600 mb-4">
                            You have exited fullscreen mode. This is your first warning.
                        </p>
                        <p className="text-red-600 font-semibold mb-6">
                            If you exit fullscreen again, your test will be automatically submitted.
                        </p>
                        <Button onClick={resumeTest} className="w-full">
                            Return to Test
                        </Button>
                    </div>
                </Modal>
            </div>
        );
    }

    if (step === 'result' && testResults) {
        const percentage = testResults.totalQuestions > 0 
            ? Math.round((testResults.score / testResults.totalQuestions) * 100) 
            : 0;

        return (
            <div className="min-h-screen bg-gray-100 py-8">
                <div className="max-w-2xl mx-auto">
                    <div className="bg-white p-8 rounded-lg shadow-lg text-center">
                        <div className="mb-6">
                            {percentage >= 70 ? (
                                <FaCheckCircle className="text-6xl text-green-500 mx-auto mb-4" />
                            ) : (
                                <FaTimesCircle className="text-6xl text-red-500 mx-auto mb-4" />
                            )}
                        </div>

                        <h1 className="text-3xl font-bold text-gray-800 mb-2">Test Completed!</h1>
                        <p className="text-gray-600 mb-8">Thank you, {testResults.name || formData.name}</p>

                        <div className="bg-gray-50 p-6 rounded-lg mb-8">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div>
                                    <div className="text-3xl font-bold text-blue-600">{testResults.score}</div>
                                    <div className="text-sm text-gray-600">Correct Answers</div>
                                </div>
                                <div>
                                    <div className="text-3xl font-bold text-purple-600">{testResults.totalQuestions}</div>
                                    <div className="text-sm text-gray-600">Total Questions</div>
                                </div>
                                <div>
                                    <div className="text-3xl font-bold text-green-600">{percentage}%</div>
                                    <div className="text-sm text-gray-600">Score Percentage</div>
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <Button onClick={resetTest} className="w-full">
                                Take Another Test
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500"></div>
        </div>
    );
};

export default QuickTest;