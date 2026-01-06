from PIL import Image
import os

png_path = r"t:\Dev\personal\_myProductionGithub\tactio\assets\app_logo.png"
ico_path = r"t:\Dev\personal\_myProductionGithub\tactio\assets\logo.ico"

try:
    img = Image.open(png_path)
    # Resize to standard icon sizes
    icon_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img.save(ico_path, sizes=icon_sizes)
    print(f"Successfully converted {png_path} to {ico_path}")
except Exception as e:
    print(f"Error converting: {e}")
