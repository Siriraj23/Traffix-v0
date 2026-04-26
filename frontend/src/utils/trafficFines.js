// Traffic Fine Amounts as per Motor Vehicles (Amendment) Act 2019
// Reference: Indian Traffic Rules 2026 

export const TRAFFIC_FINES = {
  // Document Related Violations
  driving_without_licence: 5000,
  driving_without_license: 5000,
  no_license: 5000,
  
  driving_without_insurance: 2000,
  no_insurance: 2000,
  
  driving_without_rc: 5000,
  no_registration: 5000,
  
  driving_without_fitness: 5000,
  no_fitness_certificate: 5000,
  
  no_puc: 1000,
  no_pollution_certificate: 1000,
  
  // Safety Violations
  no_helmet: 1000,
  riding_without_helmet: 1000,
  no_helmet_pillion: 1000,
  
  no_seatbelt: 1000,
  without_seatbelt: 1000,
  
  triple_riding: 2000,
  triple_riding_two_wheeler: 2000,
  
  // Signal and Driving Violations
  signal_violation: 500,
  jumping_traffic_signal: 500,
  red_light_violation: 500,
  
  overspeeding: 2000,
  over_speeding: 2000,
  speeding: 2000,
  
  dangerous_driving: 5000,
  reckless_driving: 5000,
  
  wrong_route: 500,
  wrong_side_driving: 500,
  one_way_violation: 500,
  
  // Mobile and Distraction
  mobile_phone_usage: 5000,
  using_phone_while_driving: 5000,
  
  // Alcohol and Drugs
  drunk_driving: 10000,
  driving_under_influence: 10000,
  
  // Parking Violations
  wrong_parking: 500,
  no_parking: 500,
  improper_parking: 500,
  
  // Emergency Vehicle
  not_giving_way_emergency: 10000,
  blocking_ambulance: 10000,
  
  // Pollution and Noise
  noise_pollution: 1000,
  air_pollution: 5000,
  without_silencer: 1000,
  pressure_horn: 1000,
  
  // Other Violations
  racing: 5000,
  overloaded_vehicle: 20000,
  allowing_underage_driving: 25000,
  
  // Default fallback
  default: 500
};

// Get fine amount by violation type
export const getFineAmount = (violationType) => {
  if (!violationType) return TRAFFIC_FINES.default;
  
  const normalizedType = violationType.toLowerCase().trim();
  
  // Direct match
  if (TRAFFIC_FINES[normalizedType]) {
    return TRAFFIC_FINES[normalizedType];
  }
  
  // Partial match
  for (const [key, value] of Object.entries(TRAFFIC_FINES)) {
    if (normalizedType.includes(key) || key.includes(normalizedType)) {
      return value;
    }
  }
  
  // Type-based defaults
  if (normalizedType.includes('helmet')) return 1000;
  if (normalizedType.includes('seatbelt')) return 1000;
  if (normalizedType.includes('signal')) return 500;
  if (normalizedType.includes('speed')) return 2000;
  if (normalizedType.includes('license') || normalizedType.includes('licence')) return 5000;
  if (normalizedType.includes('insurance')) return 2000;
  if (normalizedType.includes('drunk') || normalizedType.includes('alcohol')) return 10000;
  if (normalizedType.includes('mobile') || normalizedType.includes('phone')) return 5000;
  if (normalizedType.includes('parking')) return 500;
  if (normalizedType.includes('triple')) return 2000;
  
  return TRAFFIC_FINES.default;
};

// Get fine description
export const getFineDescription = (violationType) => {
  const descriptions = {
    no_helmet: 'Riding without helmet - Rs. 1,000',
    no_seatbelt: 'Driving without seatbelt - Rs. 1,000',
    signal_violation: 'Jumping traffic signal - Rs. 500',
    overspeeding: 'Overspeeding - Rs. 2,000',
    triple_riding: 'Triple riding on two-wheeler - Rs. 2,000',
    driving_without_licence: 'Driving without valid license - Rs. 5,000',
    driving_without_insurance: 'Driving without insurance - Rs. 2,000',
    mobile_phone_usage: 'Using mobile phone while driving - Rs. 5,000',
    drunk_driving: 'Drunk driving - Rs. 10,000',
    dangerous_driving: 'Dangerous/Reckless driving - Rs. 5,000',
    wrong_parking: 'Wrong parking - Rs. 500',
    wrong_route: 'Wrong route/One-way violation - Rs. 500',
    without_silencer: 'Driving without silencer - Rs. 1,000',
    no_puc: 'No Pollution Certificate - Rs. 1,000',
    overloaded_vehicle: 'Overloaded vehicle - Rs. 20,000',
    racing: 'Illegal racing - Rs. 5,000',
    not_giving_way_emergency: 'Not giving way to emergency vehicle - Rs. 10,000',
  };
  
  if (!violationType) return 'Fine amount as per MV Act';
  
  const normalizedType = violationType.toLowerCase().trim();
  
  for (const [key, desc] of Object.entries(descriptions)) {
    if (normalizedType.includes(key)) return desc;
  }
  
  return `Fine as per Motor Vehicles Act - Rs. ${getFineAmount(violationType)}`;
};