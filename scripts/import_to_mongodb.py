import pandas as pd
from pymongo import MongoClient
from datetime import datetime
import os
import sys

# Add the current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

def import_kaggle_data():
    """Import Kaggle traffic violation data to MongoDB"""
    
    print("🚦 Importing Traffic Violation Dataset to MongoDB")
    print("=" * 50)
    
    # Connect to MongoDB
    try:
        client = MongoClient('mongodb://localhost:27017/')
        db = client['traffic_violation']
        collection = db['violations']
        print("✅ Connected to MongoDB")
    except Exception as e:
        print(f"❌ Failed to connect to MongoDB: {e}")
        return
    
    # Check if CSV file exists
    csv_file = 'Indian_Traffic_Violations.csv'
    csv_path = os.path.join(os.path.dirname(__file__), '..', 'datasets', csv_file)
    
    # Alternative locations
    if not os.path.exists(csv_path):
        # Try current directory
        csv_path = csv_file
        if not os.path.exists(csv_path):
            # Try parent directory
            csv_path = os.path.join('..', 'datasets', csv_file)
            if not os.path.exists(csv_path):
                print(f"❌ CSV file not found: {csv_file}")
                print("📥 Please download from Kaggle first:")
                print("   https://www.kaggle.com/datasets/khushikyad001/indian-traffic-violation")
                return
    
    # Read CSV file
    try:
        print(f"📖 Reading CSV file: {csv_path}")
        df = pd.read_csv(csv_path)
        print(f"✅ Loaded {len(df)} records from CSV")
    except Exception as e:
        print(f"❌ Error reading CSV: {e}")
        return
    
    # Clean and transform data
    documents = []
    violation_mapping = {
        'Speeding': 'overspeeding',
        'Red Light': 'signal_violation',
        'No Seatbelt': 'no_seatbelt',
        'Triple Riding': 'triple_riding',
        'Wrong Route': 'wrong_route',
        'No Helmet': 'no_helmet',
        'Illegal Parking': 'illegal_parking',
        'Drunk Driving': 'drunk_driving'
    }
    
    # Vehicle types mapping
    vehicle_mapping = {
        'Car': 'car',
        'Motorcycle': 'bike',
        'Bike': 'bike',
        'Truck': 'truck',
        'Bus': 'bus',
        'Auto': 'auto'
    }
    
    for idx, row in df.iterrows():
        try:
            # Convert date
            date_str = row.get('Date', '')
            if pd.notna(date_str):
                try:
                    timestamp = datetime.strptime(str(date_str), '%Y-%m-%d')
                except:
                    timestamp = datetime.now()
            else:
                timestamp = datetime.now()
            
            # Get violation type
            violation_type = row.get('Violation_Type', '')
            mapped_type = violation_mapping.get(violation_type, 'signal_violation')
            
            # Get vehicle type
            vehicle_type = row.get('Vehicle_Type', 'car')
            mapped_vehicle = vehicle_mapping.get(vehicle_type, 'car')
            
            # Get fine amount
            fine_amount = row.get('Fine_Amount', 1000)
            if pd.notna(fine_amount):
                try:
                    fine_amount = float(fine_amount)
                except:
                    fine_amount = 1000
            else:
                fine_amount = 1000
            
            # Create document
            document = {
                'violationId': f"KAGGLE-{idx}-{datetime.now().strftime('%Y%m%d')}",
                'type': mapped_type,
                'vehicleNumber': str(row.get('Vehicle_Number', f'UNKNOWN-{idx}')),
                'vehicleType': mapped_vehicle,
                'location': {
                    'address': str(row.get('Location', 'Unknown')),
                    'city': str(row.get('City', '')),
                    'state': str(row.get('State', ''))
                },
                'timestamp': timestamp,
                'confidence': 0.85,  # High confidence for Kaggle data
                'status': 'detected' if pd.isna(row.get('Status')) else str(row.get('Status')).lower(),
                'fineAmount': fine_amount,
                'description': str(row.get('Description', f'{violation_type} violation detected')),
                'source': 'kaggle_indian_traffic_dataset',
                'createdAt': datetime.now()
            }
            
            # Add speed data if available
            if 'Speed' in row and pd.notna(row['Speed']):
                document['speed'] = float(row['Speed'])
                document['speedLimit'] = float(row.get('Speed_Limit', 60))
            
            # Add driver info if available
            if 'Driver_Age' in row and pd.notna(row['Driver_Age']):
                document['driverInfo'] = {
                    'age': int(row['Driver_Age']),
                    'gender': str(row.get('Driver_Gender', ''))
                }
            
            # Add weather info if available
            if 'Weather' in row and pd.notna(row['Weather']):
                document['weather'] = str(row['Weather'])
            
            documents.append(document)
            
            # Insert in batches of 500
            if len(documents) >= 500:
                collection.insert_many(documents)
                print(f"✅ Inserted {len(documents)} documents")
                documents = []
                
        except Exception as e:
            print(f"⚠️ Error processing row {idx}: {e}")
            continue
    
    # Insert remaining documents
    if documents:
        collection.insert_many(documents)
        print(f"✅ Inserted final {len(documents)} documents")
    
    # Create indexes for better performance
    print("\n📊 Creating indexes...")
    collection.create_index([('type', 1)])
    collection.create_index([('timestamp', -1)])
    collection.create_index([('vehicleNumber', 1)])
    collection.create_index([('location.state', 1)])
    collection.create_index([('status', 1)])
    
    # Get total count
    total = collection.count_documents({})
    print(f"\n🎉 Import Complete!")
    print(f"📊 Total documents in MongoDB: {total}")
    
    # Show sample data
    sample = collection.find_one()
    if sample:
        print("\n📄 Sample document:")
        print(f"   ID: {sample.get('violationId')}")
        print(f"   Type: {sample.get('type')}")
        print(f"   Vehicle: {sample.get('vehicleNumber')}")
        print(f"   Fine: ₹{sample.get('fineAmount')}")
    
    client.close()

def create_sample_dataset():
    """Create a sample dataset if no CSV is available"""
    print("📝 Creating sample dataset for testing...")
    
    import random
    from datetime import timedelta
    
    client = MongoClient('mongodb://localhost:27017/')
    db = client['traffic_violation']
    collection = db['violations']
    
    violation_types = [
        'signal_violation', 'overspeeding', 'no_seatbelt', 
        'triple_riding', 'wrong_route', 'no_helmet'
    ]
    
    vehicle_types = ['car', 'bike', 'truck', 'bus', 'auto']
    states = ['MH', 'DL', 'KA', 'TN', 'GJ', 'AP', 'UP', 'RJ', 'WB', 'PB']
    
    documents = []
    
    for i in range(100):  # Create 100 sample records
        state = random.choice(states)
        number = random.randint(10, 99)
        letters = ''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ', k=2))
        final_num = random.randint(1000, 9999)
        vehicle_number = f"{state}{number}{letters}{final_num}"
        
        timestamp = datetime.now() - timedelta(days=random.randint(0, 365))
        violation_type = random.choice(violation_types)
        
        fine_amounts = {
            'signal_violation': 2000,
            'overspeeding': 1500,
            'no_seatbelt': 1000,
            'triple_riding': 500,
            'wrong_route': 3000,
            'no_helmet': 500
        }
        
        document = {
            'violationId': f"SAMPLE-{i+1}-{datetime.now().strftime('%Y%m%d')}",
            'type': violation_type,
            'vehicleNumber': vehicle_number,
            'vehicleType': random.choice(vehicle_types),
            'location': {
                'address': f"{random.choice(['Main Street', 'Highway', 'City Center', 'Ring Road', 'Market Area'])}",
                'city': random.choice(['Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad']),
                'state': state
            },
            'timestamp': timestamp,
            'confidence': 0.7 + random.random() * 0.25,
            'status': random.choice(['detected', 'fined', 'reviewed']),
            'fineAmount': fine_amounts[violation_type],
            'description': f'{violation_type.replace("_", " ")} detected',
            'source': 'sample_dataset',
            'createdAt': datetime.now()
        }
        
        documents.append(document)
        
        if len(documents) >= 50:
            collection.insert_many(documents)
            documents = []
    
    if documents:
        collection.insert_many(documents)
    
    total = collection.count_documents({})
    print(f"✅ Created {total} sample documents")
    client.close()

if __name__ == "__main__":
    print("🚦 Traffic Violation Dataset Import Tool")
    print("=" * 50)
    
    # Check if CSV exists
    csv_exists = os.path.exists('Indian_Traffic_Violations.csv') or \
                 os.path.exists('../datasets/Indian_Traffic_Violations.csv')
    
    if csv_exists:
        print("📁 Found Kaggle dataset, importing...")
        import_kaggle_data()
    else:
        print("⚠️  Kaggle dataset not found.")
        print("Options:")
        print("1. Download from: https://www.kaggle.com/datasets/khushikyad001/indian-traffic-violation")
        print("2. Place the CSV file in 'datasets/' folder")
        print("3. Or run with sample data")
        print()
        
        choice = input("Create sample dataset instead? (y/n): ")
        if choice.lower() == 'y':
            create_sample_dataset()
        else:
            print("❌ No data imported. Please download the dataset from Kaggle.")