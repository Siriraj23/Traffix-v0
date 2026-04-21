import tensorflow as tf
from tensorflow import keras
import numpy as np
import cv2
import os

def create_simple_cnn(input_shape=(128, 128, 3), num_classes=5):
    """Create a simple CNN for traffic violation classification"""
    model = keras.Sequential([
        keras.layers.Input(shape=input_shape),
        keras.layers.Conv2D(32, (3, 3), activation='relu'),
        keras.layers.MaxPooling2D((2, 2)),
        keras.layers.Conv2D(64, (3, 3), activation='relu'),
        keras.layers.MaxPooling2D((2, 2)),
        keras.layers.Conv2D(128, (3, 3), activation='relu'),
        keras.layers.MaxPooling2D((2, 2)),
        keras.layers.Flatten(),
        keras.layers.Dense(128, activation='relu'),
        keras.layers.Dropout(0.5),
        keras.layers.Dense(num_classes, activation='softmax')
    ])
    
    model.compile(
        optimizer='adam',
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )
    
    return model

def load_dataset(data_dir):
    """Load dataset from directory"""
    images = []
    labels = []
    
    classes = ['signal_violation', 'triple_riding', 'no_seatbelt', 'normal', 'wrong_route']
    
    for class_idx, class_name in enumerate(classes):
        class_dir = os.path.join(data_dir, class_name)
        if not os.path.exists(class_dir):
            continue
            
        for img_name in os.listdir(class_dir)[:100]:  # Limit to 100 images per class for demo
            img_path = os.path.join(class_dir, img_name)
            img = cv2.imread(img_path)
            if img is not None:
                img = cv2.resize(img, (128, 128))
                img = img / 255.0  # Normalize
                images.append(img)
                labels.append(class_idx)
    
    return np.array(images), np.array(labels)

def train_model():
    """Train the violation detection model"""
    print("Loading dataset...")
    X, y = load_dataset('datasets/traffic_violations')
    
    if len(X) == 0:
        print("No data found. Please add images to the datasets directory.")
        return
    
    # Convert labels to one-hot encoding
    y = tf.keras.utils.to_categorical(y, num_classes=5)
    
    # Split data
    from sklearn.model_selection import train_test_split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    print(f"Training samples: {len(X_train)}")
    print(f"Testing samples: {len(X_test)}")
    
    # Create and train model
    model = create_simple_cnn()
    
    print("Training model...")
    history = model.fit(
        X_train, y_train,
        epochs=20,
        batch_size=32,
        validation_split=0.2,
        verbose=1
    )
    
    # Evaluate
    test_loss, test_acc = model.evaluate(X_test, y_test, verbose=0)
    print(f"Test accuracy: {test_acc:.2f}")
    
    # Save model
    model.save('models/traffic_violation_model.h5')
    print("Model saved to models/traffic_violation_model.h5")
    
    return model, history

if __name__ == "__main__":
    # Create models directory
    os.makedirs('models', exist_ok=True)
    
    # Train model
    train_model()