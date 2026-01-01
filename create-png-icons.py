"""
Simple script to create placeholder PNG icons for the extension
Requires: pip install Pillow
"""

from PIL import Image, ImageDraw

def create_icon(size, filename):
    # Create a new image with green background
    img = Image.new('RGB', (size, size), color='#4CAF50')
    draw = ImageDraw.Draw(img)

    # Scale factor for different sizes
    scale = size / 128

    # Draw a checkmark (white)
    # Scaled coordinates
    points = [
        (int(40 * scale), int(50 * scale)),
        (int(60 * scale), int(70 * scale)),
        (int(88 * scale), int(40 * scale))
    ]

    line_width = max(2, int(8 * scale))

    # Draw checkmark lines
    draw.line([points[0], points[1]], fill='white', width=line_width)
    draw.line([points[1], points[2]], fill='white', width=line_width)

    # Draw arrows (simplified)
    center_x = int(64 * scale)
    center_y = int(90 * scale)
    arrow_size = max(3, int(6 * scale))

    # Draw circle
    draw.ellipse(
        [center_x - arrow_size, center_y - arrow_size,
         center_x + arrow_size, center_y + arrow_size],
        fill='white'
    )

    # Save the image
    img.save(filename, 'PNG')
    print(f'Created {filename}')

# Create icons in different sizes
sizes = [16, 48, 128]
for size in sizes:
    create_icon(size, f'icons/icon{size}.png')

print('\nAll icons created successfully!')
print('You can now load the extension in Chrome/Edge.')
