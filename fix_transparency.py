from PIL import Image
import numpy as np

path = r"t:\Dev\personal\_myProductionGithub\tactio\assets\app_logo.png"
out_path = r"t:\Dev\personal\_myProductionGithub\tactio\assets\app_logo_fixed.png"
ico_path = r"t:\Dev\personal\_myProductionGithub\tactio\assets\logo.ico"

try:
    img = Image.open(path).convert("RGBA")
    
    datas = img.getdata()

    newData = []
    for item in datas:
        # Change all white (also shades of whites)
        # to transparent
        if item[0] > 240 and item[1] > 240 and item[2] > 240:
            newData.append((255, 255, 255, 0))
        else:
            newData.append(item)

    img.putdata(newData)
    img.save(out_path, "PNG")
    print(f"Saved transparent PNG to {out_path}")

    # Regenerate ICO
    icon_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
    img.save(ico_path, sizes=icon_sizes)
    print(f"Regenerated ICO at {ico_path}")

except Exception as e:
    print(f"Error: {e}")
