// Shared violations store - works across all components
const VIOLATIONS_STORE_KEY = 'traffic_saved_violations';

// Event listeners storage
const listeners = new Set();

// Get all saved violations
export const getSavedViolations = () => {
  try {
    const data = localStorage.getItem(VIOLATIONS_STORE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error('Error reading violations:', err);
    return [];
  }
};

// Save violations
export const saveViolations = (violations) => {
  try {
    localStorage.setItem(VIOLATIONS_STORE_KEY, JSON.stringify(violations));
    // Notify all listeners
    notifyListeners();
    return true;
  } catch (err) {
    console.error('Error saving violations:', err);
    return false;
  }
};

// Add a single violation
export const addViolation = (violation) => {
  const violations = getSavedViolations();
  // Check for duplicates
  const isDuplicate = violations.some(v => 
    v.vehicleNumber === violation.vehicleNumber && 
    v.type === violation.type &&
    Math.abs(new Date(v.savedAt || v.timestamp) - new Date(violation.savedAt || violation.timestamp)) < 10000
  );
  
  if (!isDuplicate) {
    violations.push({
      ...violation,
      _id: violation._id || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      savedAt: violation.savedAt || new Date().toISOString()
    });
    saveViolations(violations);
    return true;
  }
  return false;
};

// Add multiple violations
export const addViolations = (newViolations) => {
  const violations = getSavedViolations();
  let addedCount = 0;
  
  newViolations.forEach(v => {
    const isDuplicate = violations.some(existing => 
      existing.vehicleNumber === v.vehicleNumber && 
      existing.type === v.type &&
      Math.abs(new Date(existing.savedAt || existing.timestamp) - new Date(v.savedAt || v.timestamp)) < 10000
    );
    
    if (!isDuplicate) {
      violations.push({
        ...v,
        _id: v._id || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_${addedCount}`,
        savedAt: v.savedAt || new Date().toISOString()
      });
      addedCount++;
    }
  });
  
  if (addedCount > 0) {
    saveViolations(violations);
  }
  return addedCount;
};

// Update a violation
export const updateViolation = (id, updates) => {
  const violations = getSavedViolations();
  const index = violations.findIndex(v => v._id === id || v.violationId === id);
  if (index !== -1) {
    violations[index] = { ...violations[index], ...updates };
    saveViolations(violations);
    return true;
  }
  return false;
};

// Delete a violation
export const deleteViolation = (id) => {
  const violations = getSavedViolations();
  const filtered = violations.filter(v => v._id !== id && v.violationId !== id);
  if (filtered.length !== violations.length) {
    saveViolations(filtered);
    return true;
  }
  return false;
};

// Subscribe to changes
export const subscribeToViolations = (callback) => {
  listeners.add(callback);
  // Return unsubscribe function
  return () => {
    listeners.delete(callback);
  };
};

// Notify all listeners
const notifyListeners = () => {
  const violations = getSavedViolations();
  listeners.forEach(callback => {
    try {
      callback(violations);
    } catch (err) {
      console.error('Error in listener:', err);
    }
  });
};