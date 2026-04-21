function simulateAIDetection(data, imageAnalysis = null) {
    // If we have actual image analysis from AI model, use it
    if (imageAnalysis && imageAnalysis.objects) {
        return analyzeImageWithAI(imageAnalysis.objects, data);
    }
    
    // Otherwise, use smart simulation based on image content
    return smartViolationDetection(data);
}

function analyzeImageWithAI(objects, data) {
    const violations = [];
    
    // Count objects
    const personCount = objects.filter(obj => obj.class === 'person').length;
    const motorcycleCount = objects.filter(obj => obj.class === 'motorcycle' || obj.class === 'bicycle').length;
    const carCount = objects.filter(obj => obj.class === 'car').length;
    
    // Check for triple riding
    if (motorcycleCount > 0 && personCount >= 3) {
        // Check if persons are near motorcycles
        const motorcycles = objects.filter(obj => obj.class === 'motorcycle' || obj.class === 'bicycle');
        const persons = objects.filter(obj => obj.class === 'person');
        
        for (const bike of motorcycles) {
            let personsNearBike = 0;
            
            for (const person of persons) {
                const distance = Math.sqrt(
                    Math.pow(bike.x - person.x, 2) + Math.pow(bike.y - person.y, 2)
                );
                
                if (distance < 100) { // Person is near the bike
                    personsNearBike++;
                }
            }
            
            if (personsNearBike >= 3) {
                violations.push({
                    type: 'triple_riding',
                    confidence: 0.85 + Math.random() * 0.1,
                    description: `Triple riding detected: ${personsNearBike} persons on two-wheeler`,
                    persons_count: personsNearBike,
                    vehicle_type: 'bike'
                });
                
                // Also check for no helmet
                violations.push({
                    type: 'no_helmet',
                    confidence: 0.75,
                    description: 'Rider(s) without helmet detected',
                    vehicle_type: 'bike'
                });
                
                break; // Found triple riding, no need to check other bikes
            }
        }
    }
    
    // Check for signal violation (if image shows red light or intersection)
    if (objects.some(obj => obj.class === 'traffic light' || obj.class === 'red light')) {
        if (carCount > 0 || motorcycleCount > 0) {
            violations.push({
                type: 'signal_violation',
                confidence: 0.8 + Math.random() * 0.15,
                description: 'Red light violation detected',
                vehicles_in_intersection: carCount + motorcycleCount
            });
        }
    }
    
    // Check for no seatbelt (in cars)
    if (carCount > 0) {
        const cars = objects.filter(obj => obj.class === 'car');
        const persons = objects.filter(obj => obj.class === 'person');
        
        for (const car of cars) {
            // Check if there's a person in the driver seat area
            for (const person of persons) {
                if (isPersonInCar(person, car)) {
                    // Check for seatbelt (simplified - in real AI, this would be more complex)
                    if (!hasSeatbelt(person, car)) {
                        violations.push({
                            type: 'no_seatbelt',
                            confidence: 0.7 + Math.random() * 0.2,
                            description: 'Driver not wearing seatbelt',
                            vehicle_type: 'car'
                        });
                    }
                    break;
                }
            }
        }
    }
    
    // If no violations detected by AI, return at least something for demo
    if (violations.length === 0) {
        return smartViolationDetection(data);
    }
    
    return violations;
}

function isPersonInCar(person, car) {
    // Simplified: Check if person is inside car bounding box
    return (
        person.x > car.x - car.width/2 &&
        person.x < car.x + car.width/2 &&
        person.y > car.y - car.height/2 &&
        person.y < car.y + car.height/2
    );
}

function hasSeatbelt(person, car) {
    // Simplified seatbelt detection
    // In real AI, this would check for diagonal lines across chest
    return Math.random() > 0.7; // 30% chance of no seatbelt
}

function smartViolationDetection(data) {
    // Analyze the form data to guess what violation might be in the image
    const violations = [];
    
    // If user mentions "bike" or "motorcycle" in description
    const description = (data.description || '').toLowerCase();
    const vehicleType = (data.vehicleType || '').toLowerCase();
    
    // Check for bike-related violations
    if (vehicleType === 'bike' || vehicleType === 'motorcycle' || 
        description.includes('bike') || description.includes('motorcycle')) {
        
        // Triple riding is common on bikes
        if (Math.random() > 0.6) {
            violations.push({
                type: 'triple_riding',
                confidence: 0.8 + Math.random() * 0.15,
                description: 'Three persons detected on two-wheeler',
                persons_count: 3,
                vehicle_type: 'bike'
            });
        }
        
        // No helmet is also common
        if (Math.random() > 0.5) {
            violations.push({
                type: 'no_helmet',
                confidence: 0.75 + Math.random() * 0.2,
                description: 'Rider without helmet detected',
                vehicle_type: 'bike'
            });
        }
    }
    
    // Check for car-related violations
    if (vehicleType === 'car' || description.includes('car')) {
        // Signal violation and no seatbelt are common for cars
        if (Math.random() > 0.7) {
            violations.push({
                type: 'signal_violation',
                confidence: 0.85 + Math.random() * 0.1,
                description: 'Red light violation detected',
                vehicles_in_intersection: 1
            });
        }
        
        if (Math.random() > 0.6) {
            violations.push({
                type: 'no_seatbelt',
                confidence: 0.7 + Math.random() * 0.2,
                description: 'Driver not wearing seatbelt',
                vehicle_type: 'car'
            });
        }
    }
    
    // If still no violations, pick random ones
    if (violations.length === 0) {
        const types = ['signal_violation', 'no_seatbelt', 'triple_riding', 'wrong_route', 'no_helmet'];
        const randomType = types[Math.floor(Math.random() * types.length)];
        
        const violation = {
            type: randomType,
            confidence: 0.7 + Math.random() * 0.25,
            description: getViolationDescription(randomType, data)
        };
        
        if (randomType === 'overspeeding') {
            violation.speed = 60 + Math.floor(Math.random() * 40);
            violation.speedLimit = 60;
        }
        
        violations.push(violation);
    }
    
    return violations;
}

function getViolationDescription(type, data) {
    const descriptions = {
        signal_violation: `Red light violation detected for vehicle ${data.vehicleNumber || 'unknown'}`,
        overspeeding: `Vehicle exceeding speed limit by ${Math.floor(Math.random() * 30)} km/h`,
        no_seatbelt: 'Driver not wearing seatbelt',
        triple_riding: 'Three persons detected on two-wheeler',
        wrong_route: 'Vehicle in restricted zone',
        no_helmet: 'Rider without helmet detected'
    };
    return descriptions[type] || 'Traffic violation detected';
}