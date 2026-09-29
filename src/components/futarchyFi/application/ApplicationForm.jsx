import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckIcon } from '@heroicons/react/solid';

const steps = [
  {
    id: 'project',
    name: 'Project Details',
    fields: [
      {
        id: 'projectName',
        label: 'Project Name',
        type: 'text',
        required: true,
      },
      {
        id: 'projectDescription',
        label: 'Project Description',
        type: 'textarea',
        placeholder: 'Provide a brief overview of your project, including the problem it addresses and the solution it offers.',
        required: true,
      },
      {
        id: 'website',
        label: 'Website',
        type: 'url',
        required: true,
      }
    ]
  },
  {
    id: 'contact',
    name: 'Contact Information',
    fields: [
      {
        id: 'contactName',
        label: 'Contact Name',
        type: 'text',
        required: true,
      },
      {
        id: 'position',
        label: 'Title/Position',
        type: 'text',
        required: true,
      },
      {
        id: 'email',
        label: 'Company Email',
        type: 'email',
        required: true,
      }
    ]
  },
  {
    id: 'background',
    name: 'Project Background',
    fields: [
      {
        id: 'missionStatement',
        label: 'Mission Statement',
        type: 'textarea',
        placeholder: 'What is the mission or long-term goal of your project?',
        required: true,
      },
      {
        id: 'stage',
        label: 'Current Stage of Project',
        type: 'select',
        options: [
          'Idea',
          'Early-stage (prototype/PoC)',
          'Pre-launch',
          'Live with users',
          'Scaling'
        ],
        required: true,
      },
      {
        id: 'challenges',
        label: 'Decision-Making Challenges',
        type: 'textarea',
        placeholder: 'What are the most critical or complex governance decisions you face?',
        required: true,
      }
    ]
  },
  {
    id: 'futarchy',
    name: 'Futarchy Interest',
    fields: [
      {
        id: 'whyFutarchy',
        label: 'Why Futarchy?',
        type: 'textarea',
        placeholder: 'Explain why you are interested in futarchy-based governance. What specific outcomes or improvements do you hope futarchy will achieve for your project?',
        required: true,
      },
      {
        id: 'decisions',
        label: 'Types of Decisions',
        type: 'multiselect',
        options: [
          'Budget Allocation',
          'Project Prioritization',
          'Stakeholder Voting',
          'Policy Adjustments',
          'Strategic Roadmap',
          'Other'
        ],
        required: true,
      },
      {
        id: 'hasToken',
        label: 'Does your project have an existing token?',
        type: 'radio',
        options: ['Yes', 'No'],
        required: true,
      },
      {
        id: 'tokenAddress',
        label: 'If Yes, please provide the token address.',
        type: 'text',
        required: false,
      }
    ]
  },
  {
    id: 'governance',
    name: 'Governance Implementation Details',
    fields: [
      {
        id: 'enforceability',
        label: 'Enforceability of Futarchy Decisions',
        type: 'radio',
        options: ['Advisory', 'Enforceable'],
        required: true,
      },
      {
        id: 'currentGovernance',
        label: 'Current Governance Setup',
        type: 'textarea',
        placeholder: 'Briefly describe your existing governance model, including voting rights, decision-making processes, and how they are currently managed.',
        required: true,
      },
      {
        id: 'technicalInfrastructure',
        label: 'Do you have any existing blockchain or smart contract infrastructure?',
        type: 'radio',
        options: ['Yes', 'No'],
        required: true,
      },
      {
        id: 'infrastructureDetails',
        label: 'If Yes, please provide details.',
        type: 'textarea',
        required: false,
      },
      {
        id: 'familiarity',
        label: 'Team’s Familiarity with Futarchy or Prediction Markets',
        type: 'radio',
        options: ['Highly Experienced', 'Some Experience', 'Little to No Experience'],
        required: true,
      },
      {
        id: 'assistanceNeeded',
        label: 'Will You Need Assistance with Implementation?',
        type: 'radio',
        options: ['Yes', 'No'],
        required: true,
      },
      {
        id: 'assistanceDetails',
        label: 'Please describe any specific areas where you need support.',
        type: 'textarea',
        required: false,
      }
    ]
  },
  {
    id: 'timeline',
    name: 'Timeline and Commitment',
    fields: [
      {
        id: 'startDate',
        label: 'Desired Start Date for Futarchy Implementation',
        type: 'date',
        required: true,
      },
      {
        id: 'milestones',
        label: 'Timeline for Key Milestones (if known)',
        type: 'textarea',
        required: false,
      },
      {
        id: 'commitment',
        label: 'Are You Committed to Being an Early Adopter and Providing Feedback to Improve Futarchy as a Service?',
        type: 'radio',
        options: ['Yes', 'No'],
        required: true,
      }
    ]
  },
  {
    id: 'additional',
    name: 'Additional Information',
    fields: [
      {
        id: 'additionalDetails',
        label: 'Any Additional Details or Questions',
        type: 'textarea',
        required: false,
      }
    ]
  }
];

const ApplicationForm = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  const handleInputChange = (fieldId, value) => {
    setFormData(prev => ({
      ...prev,
      [fieldId]: value
    }));
    
    if (hasSubmitted) {
      validateField(fieldId, value);
    }
  };

  const validateField = (fieldId, value) => {
    let error = '';
    if (!value && steps[currentStep].fields.find(f => f.id === fieldId)?.required) {
      error = 'This field is required';
    }
    setErrors(prev => ({
      ...prev,
      [fieldId]: error
    }));
  };

  const validateStep = () => {
    setHasSubmitted(true);
    const currentFields = steps[currentStep].fields;
    const newErrors = {};
    
    currentFields.forEach(field => {
      if (field.required && !formData[field.id]) {
        newErrors[field.id] = 'This field is required';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep()) {
      if (currentStep < steps.length - 1) {
        setCurrentStep(prev => prev + 1);
      } else {
        handleSubmit();
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // Submit directly to FormBold without FormData
      const response = await fetch("https://formbold.com/s/60pGq", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setIsComplete(true);
      } else {
        console.error("Form submission failed:", response.statusText);
      }
    } catch (error) {
      console.error("Error submitting form:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field) => {
    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            className={`w-full bg-white border ${errors[field.id] ? "border-red-500" : "border-gray-200"} px-4 py-3 text-black placeholder:text-aave-gray/50 focus:border-aave-purple focus:outline-none transition-colors`}
            rows="4"
            value={formData[field.id] || ''}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            placeholder={field.placeholder}
          />
        );
      case 'select':
        return (
          <select
            className={`w-full bg-white border ${errors[field.id] ? "border-red-500" : "border-gray-200"} px-4 py-3 text-black placeholder:text-aave-gray/50 focus:border-aave-purple focus:outline-none transition-colors`}
            value={formData[field.id] || ''}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
          >
            <option value="">Select an option</option>
            {field.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      case 'radio':
        return (
          <div className="flex flex-col">
            {field.options.map((option) => (
              <label key={option} className="flex items-center">
                <input
                  type="radio"
                  value={option}
                  checked={formData[field.id] === option}
                  onChange={(e) => handleInputChange(field.id, e.target.value)}
                  className="mr-2"
                />
                {option}
              </label>
            ))}
          </div>
        );
      case 'multiselect':
        return (
          <div className="flex flex-col">
            {field.options.map((option) => (
              <label key={option} className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData[field.id]?.includes(option)}
                  onChange={(e) => {
                    const newValues = e.target.checked
                      ? [...(formData[field.id] || []), option]
                      : formData[field.id].filter((val) => val !== option);
                    handleInputChange(field.id, newValues);
                  }}
                  className="mr-2"
                />
                {option}
              </label>
            ))}
          </div>
        );
      case 'text':
      case 'url':
      case 'email':
        return (
          <input
            type={field.type}
            className={`w-full bg-white border ${errors[field.id] ? "border-red-500" : "border-gray-200"} px-4 py-3 text-black placeholder:text-aave-gray/50 focus:border-aave-purple focus:outline-none transition-colors`}
            value={formData[field.id] || ''}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
            placeholder={field.placeholder}
          />
        );
      case 'date':
        return (
          <input
            type="date"
            className={`w-full bg-white border ${errors[field.id] ? "border-red-500" : "border-gray-200"} px-4 py-3 text-black placeholder:text-aave-gray/50 focus:border-aave-purple focus:outline-none transition-colors`}
            value={formData[field.id] || ''}
            onChange={(e) => handleInputChange(field.id, e.target.value)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-white text-black py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <AnimatePresence mode="wait">
          {isComplete ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center space-y-4"
            >
              <div className="w-20 h-20 mx-auto bg-green-500 rounded-full flex items-center justify-center">
                <CheckIcon className="w-12 h-12 text-white" />
              </div>
              <h2 className="text-3xl font-bold">Application Submitted!</h2>
              <p className="text-gray-300">
                Thank you for your interest in Futarchy. We&apos;ll review your application and get back to you within 1-2 weeks.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="space-y-8"
            >
              {/* Progress bar */}
              <div className="relative pt-1">
                <div className="flex mb-2 items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full bg-gray-800">
                      Step {currentStep + 1} of {steps.length}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold inline-block text-gray-400">
                      {Math.round(((currentStep + 1) / steps.length) * 100)}%
                    </span>
                  </div>
                </div>
                <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-gray-800">
                  <motion.div
                    initial={{ width: `${(currentStep / steps.length) * 100}%` }}
                    animate={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                    className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-gradient-to-r from-blue-500 to-purple-500"
                  />
                </div>
              </div>

              {/* Step content */}
              <div className="space-y-6">
                <h2 className="text-2xl font-bold text-black">{steps[currentStep].name}</h2>
                {steps[currentStep].fields.map((field) => (
                  <div key={field.id} className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      {field.label}
                    </label>
                    {renderField(field)}
                    {errors[field.id] && hasSubmitted && (
                      <p className="text-red-500 text-sm mt-1">{errors[field.id]}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Navigation buttons */}
              <div className="flex justify-between pt-4">
                <button
                  type="button"
                  onClick={handleBack}
                  disabled={currentStep === 0}
                  className={`px-4 py-2 border border-gray-200 rounded-md ${
                    currentStep === 0
                      ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      : 'bg-white text-black hover:bg-gray-50'
                  }`}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={isSubmitting}
                  className="w-32 bg-black border border-aave-purple/30 px-4 py-3
                    text-white relative overflow-hidden group transition-all duration-300
                    hover:bg-aave-purple hover:border-aave-purple/50
                    hover:shadow-[0_0_15px_rgba(182,80,158,0.3)]"
                >
                  <span className="relative z-10 font-medium group-hover:text-white
                    transition-colors duration-300">
                    {isSubmitting
                      ? 'Submitting...'
                      : currentStep === steps.length - 1
                      ? 'Submit'
                      : 'Next'}
                  </span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default ApplicationForm; 