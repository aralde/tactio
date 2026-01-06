from PIL import Image

path = r"t:\Dev\personal\_myProductionGithub\tactio\assets\app_logo.png"
try:
    img = Image.open(path)
    print(f"Format: {img.format}")
    print(f"Mode: {img.mode}")
    
    if img.mode == 'RGBA':
        # Check if there are any transparent pixels
        extrema = img.getextrema()
        print(f"Extrema: {extrema}")
        alpha_extrema = extrema[3]
        print(f"Alpha channel min/max: {alpha_extrema}")
        if alpha_extrema[0] < 255:
            print("Image HAS transparency.")
        else:
            print("Image has an alpha channel but is fully OPAQUE (no transparency).")
    else:
        print("Image does NOT have an alpha channel.")

except Exception as e:
    print(f"Error: {e}")
