import os

folders = [
    "train/labels",
    "valid/labels"
]

for folder in folders:
    for file in os.listdir(folder):
        path = os.path.join(folder, file)

        with open(path, "r") as f:
            lines = f.readlines()

        new_lines = []
        for line in lines:
            parts = line.split()
            parts[0] = "0"  # force class = 0
            new_lines.append(" ".join(parts) + "\n")

        with open(path, "w") as f:
            f.writelines(new_lines)

print("✅ All labels fixed!")