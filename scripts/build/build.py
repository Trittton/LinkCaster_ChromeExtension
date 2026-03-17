#!/usr/bin/env python3
"""
LinkCaster Extension Builder
Creates a production-ready ZIP file for Chrome Web Store
"""

import zipfile
import sys
from pathlib import Path
from datetime import datetime

def build_extension():
    """Build the LinkCaster extension ZIP file"""

    # Get project root (go up two levels from scripts/build/)
    script_dir = Path(__file__).parent
    project_root = script_dir.parent.parent

    print("=" * 50)
    print("  LinkCaster - Extension Builder")
    print("=" * 50)
    print()
    print(f"Project root: {project_root}")
    print()

    # Define paths
    build_dir = project_root / "build"
    build_dir.mkdir(exist_ok=True)

    zip_name = "LinkCaster_Extension.zip"
    zip_path = build_dir / zip_name

    # Files to include in the extension
    files_to_include = [
        "manifest.json",
        "popup.html",
        "popup.css",
        "background.js",
        "extension_icon.png"
    ]

    print("Copying extension files...")

    # Create ZIP file
    with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
        # Add main files
        for file_name in files_to_include:
            file_path = project_root / file_name
            if file_path.exists():
                zipf.write(file_path, file_name)
                print(f"  + {file_name}")
            else:
                print(f"  - {file_name} (NOT FOUND)", file=sys.stderr)
                return False

        # Add js/ directory with all modules
        js_dir = project_root / "js"
        if js_dir.exists():
            for js_file in js_dir.rglob("*.js"):
                rel_path = js_file.relative_to(project_root)
                zipf.write(js_file, str(rel_path))
                print(f"  + {rel_path}")
        else:
            print(f"  - js/ (NOT FOUND)", file=sys.stderr)
            return False

        # Add icons directory
        icons_dir = project_root / "icons"
        if icons_dir.exists():
            for icon_file in icons_dir.glob("*.png"):
                zipf.write(icon_file, f"icons/{icon_file.name}")
                print(f"  + icons/{icon_file.name}")
        else:
            print(f"  - icons/ (NOT FOUND)", file=sys.stderr)
            return False

    # Display success message
    size_kb = zip_path.stat().st_size / 1024

    print()
    print("=" * 50)
    print("  SUCCESS!")
    print("=" * 50)
    print()
    print(f"ZIP package created: {zip_name}")
    print(f"Location: {zip_path}")
    print(f"File size: {size_kb:.2f} KB")
    print()
    print("-" * 50)
    print("  NEXT STEPS:")
    print("-" * 50)
    print("1. Go to Chrome Web Store Developer Dashboard")
    print("   https://chrome.google.com/webstore/devconsole")
    print()
    print("2. Click 'New Item' or update existing item")
    print()
    print("3. Upload the ZIP file:")
    print(f"   {zip_path}")
    print()
    print("4. Fill in the store listing details")
    print()
    print("5. Submit for review")
    print("=" * 50)

    return True

if __name__ == "__main__":
    try:
        success = build_extension()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\nERROR: {e}", file=sys.stderr)
        sys.exit(1)
