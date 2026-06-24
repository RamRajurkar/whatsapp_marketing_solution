"""
Image compression utility for WhatsApp media uploads.
WhatsApp API limits: 5 MB for images.
This module auto-compresses images that exceed the limit.
"""

import io
import logging
from PIL import Image

logger = logging.getLogger(__name__)

# WhatsApp media limits
WA_IMAGE_MAX_BYTES = 5 * 1024 * 1024   # 5 MB
WA_IMAGE_MAX_DIMENSION = 4096           # Max width/height in pixels


def compress_image_bytes(
    file_bytes: bytes,
    filename: str,
    file_type: str = "image/jpeg",
    max_bytes: int = WA_IMAGE_MAX_BYTES,
    max_dimension: int = WA_IMAGE_MAX_DIMENSION,
) -> tuple[bytes, str, str]:
    """
    Compress an image if it exceeds WhatsApp's size limits.
    
    Returns:
        tuple of (compressed_bytes, new_filename, new_file_type)
    """
    # Only process image types
    if not file_type or not file_type.startswith("image/"):
        return file_bytes, filename, file_type

    original_size = len(file_bytes)

    # If already under the limit, return as-is
    if original_size <= max_bytes:
        logger.info(f"Image '{filename}' is {original_size / 1024:.0f} KB — within limit, no compression needed.")
        return file_bytes, filename, file_type

    logger.info(f"Image '{filename}' is {original_size / 1024:.0f} KB — exceeds {max_bytes / 1024 / 1024:.0f} MB limit. Compressing...")

    try:
        img = Image.open(io.BytesIO(file_bytes))

        # Convert RGBA/P to RGB (JPEG doesn't support transparency)
        if img.mode in ("RGBA", "P", "LA"):
            background = Image.new("RGB", img.size, (255, 255, 255))
            if img.mode == "P":
                img = img.convert("RGBA")
            background.paste(img, mask=img.split()[-1] if "A" in img.mode else None)
            img = background
        elif img.mode != "RGB":
            img = img.convert("RGB")

        # Step 1: Resize if dimensions are too large
        w, h = img.size
        if w > max_dimension or h > max_dimension:
            ratio = min(max_dimension / w, max_dimension / h)
            new_w = int(w * ratio)
            new_h = int(h * ratio)
            img = img.resize((new_w, new_h), Image.LANCZOS)
            logger.info(f"Resized from {w}x{h} to {new_w}x{new_h}")

        # Step 2: Progressively lower JPEG quality until under the limit
        for quality in [85, 75, 65, 55, 45, 35, 25]:
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=quality, optimize=True)
            compressed = buf.getvalue()

            if len(compressed) <= max_bytes:
                logger.info(
                    f"Compressed '{filename}': {original_size / 1024:.0f} KB → {len(compressed) / 1024:.0f} KB "
                    f"(quality={quality})"
                )
                # Update filename extension
                new_filename = filename.rsplit(".", 1)[0] + ".jpg" if "." in filename else filename + ".jpg"
                return compressed, new_filename, "image/jpeg"

        # Step 3: If still too large, resize down further
        for scale in [0.75, 0.5, 0.35, 0.25]:
            w, h = img.size
            new_w = int(w * scale)
            new_h = int(h * scale)
            if new_w < 100 or new_h < 100:
                break
            resized = img.resize((new_w, new_h), Image.LANCZOS)
            buf = io.BytesIO()
            resized.save(buf, format="JPEG", quality=60, optimize=True)
            compressed = buf.getvalue()

            if len(compressed) <= max_bytes:
                logger.info(
                    f"Compressed '{filename}' with resize ({new_w}x{new_h}): "
                    f"{original_size / 1024:.0f} KB → {len(compressed) / 1024:.0f} KB"
                )
                new_filename = filename.rsplit(".", 1)[0] + ".jpg" if "." in filename else filename + ".jpg"
                return compressed, new_filename, "image/jpeg"

        # Last resort: return best effort
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=25, optimize=True)
        compressed = buf.getvalue()
        logger.warning(
            f"Could not compress '{filename}' below {max_bytes / 1024 / 1024:.0f} MB. "
            f"Final size: {len(compressed) / 1024:.0f} KB"
        )
        new_filename = filename.rsplit(".", 1)[0] + ".jpg" if "." in filename else filename + ".jpg"
        return compressed, new_filename, "image/jpeg"

    except Exception as e:
        logger.error(f"Image compression failed for '{filename}': {e}")
        # Return original bytes if compression fails
        return file_bytes, filename, file_type
