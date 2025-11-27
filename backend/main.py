"""
FastAPI Backend for Wavelet Presentation

Provides APIs for:
- Wavelet decomposition (Mallat)
- DCT comparison
- Denoising
- Image quality metrics
- Signal processing demos (Fourier, filters, wavelets)
"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List
from pathlib import Path
import numpy as np
from PIL import Image
import pywt
import io
import base64
import os

# Path to data folder - use DATA_DIR env var (Docker) or fallback to relative path (local dev)
DATA_DIR = Path(os.environ.get("DATA_DIR", Path(__file__).parent.parent / "data"))
TEST_IMAGES_DIR = DATA_DIR / "standard_test_images"

app = FastAPI(
    title="Wavelet DSP API",
    description="Backend for wavelet vs DCT interactive presentation",
    version="1.0.0"
)

# CORS for the dev server only: in production the same container serves the
# frontend and the API, so those requests are same-origin and never preflight.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000", "http://localhost:3001", "http://localhost:3002",
        "http://localhost:5173", "http://127.0.0.1:3000", "http://127.0.0.1:3002",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Models
# ============================================================================

class WaveletParams(BaseModel):
    wavelet: str = "db4"
    levels: int = 3

class DenoiseParams(BaseModel):
    wavelet: str = "db4"
    levels: int = 4
    threshold: Optional[float] = None
    mode: str = "soft"  # soft or hard

class DCTParams(BaseModel):
    quality: int = 50
    block_size: int = 8


# ============================================================================
# Utility Functions
# ============================================================================

def image_to_base64(img_array: np.ndarray) -> str:
    """Convert numpy array to base64 PNG string"""
    if img_array.dtype != np.uint8:
        img_array = np.clip(img_array, 0, 255).astype(np.uint8)
    img = Image.fromarray(img_array)
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode()


def load_image_from_upload(file: UploadFile) -> np.ndarray:
    """Load uploaded image as grayscale numpy array"""
    contents = file.file.read()
    img = Image.open(io.BytesIO(contents)).convert('L')
    return np.array(img, dtype=np.float64)


def normalize_for_display(arr: np.ndarray) -> np.ndarray:
    """Normalize array to 0-255 for display"""
    if arr.max() == arr.min():
        return np.zeros_like(arr, dtype=np.uint8)
    normalized = 255 * (arr - arr.min()) / (arr.max() - arr.min())
    return normalized.astype(np.uint8)


# ============================================================================
# API Endpoints
# ============================================================================



@app.get("/api/wavelets")
async def list_wavelets():
    """List available wavelets"""
    return {
        "wavelets": [
            {"id": "haar", "name": "Haar", "description": "Simplest wavelet, good for education"},
            {"id": "db4", "name": "Daubechies 4", "description": "Good general purpose"},
            {"id": "db8", "name": "Daubechies 8", "description": "Smoother, more coefficients"},
            {"id": "bior2.2", "name": "Biorthogonal 5/3", "description": "JPEG2000 lossless"},
            {"id": "bior4.4", "name": "Biorthogonal 9/7", "description": "JPEG2000 lossy"},
            {"id": "sym4", "name": "Symlet 4", "description": "Near-symmetric"},
            {"id": "coif2", "name": "Coiflet 2", "description": "Nearly symmetric"}
        ]
    }


@app.post("/api/decompose")
async def decompose_image(
    file: UploadFile = File(...),
    wavelet: str = "db4",
    levels: int = 3
):
    """
    Perform 2D wavelet decomposition on uploaded image.
    Returns subbands as base64 images.
    """
    try:
        # Load image
        img_array = load_image_from_upload(file)
        
        # Perform decomposition
        coeffs = pywt.wavedec2(img_array, wavelet, level=levels)
        
        # Extract subbands
        subbands = {}
        
        # LL (approximation at coarsest level)
        ll = coeffs[0]
        subbands["LL"] = {
            "image": image_to_base64(normalize_for_display(ll)),
            "shape": list(ll.shape),
            "min": float(ll.min()),
            "max": float(ll.max()),
            "mean": float(ll.mean())
        }
        
        # Detail subbands at each level
        for i, (lh, hl, hh) in enumerate(coeffs[1:], 1):
            level = levels - i + 1
            subbands[f"LH{level}"] = {
                "image": image_to_base64(normalize_for_display(lh)),
                "shape": list(lh.shape),
                "energy": float(np.sum(lh**2))
            }
            subbands[f"HL{level}"] = {
                "image": image_to_base64(normalize_for_display(hl)),
                "shape": list(hl.shape),
                "energy": float(np.sum(hl**2))
            }
            subbands[f"HH{level}"] = {
                "image": image_to_base64(normalize_for_display(hh)),
                "shape": list(hh.shape),
                "energy": float(np.sum(hh**2))
            }
        
        # Create composite visualization
        composite = create_wavelet_composite(coeffs)
        
        return {
            "success": True,
            "original_shape": list(img_array.shape),
            "wavelet": wavelet,
            "levels": levels,
            "subbands": subbands,
            "composite": image_to_base64(composite)
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


def create_wavelet_composite(coeffs) -> np.ndarray:
    """Create composite image showing all subbands"""
    result = normalize_for_display(coeffs[0])

    for lh, hl, hh in coeffs[1:]:
        lh_norm = normalize_for_display(lh)
        hl_norm = normalize_for_display(hl)
        hh_norm = normalize_for_display(hh)

        # Crop to min dims - PyWavelets subbands may differ by 1px for odd-sized inputs
        h = min(result.shape[0], lh_norm.shape[0], hl_norm.shape[0], hh_norm.shape[0])
        w = min(result.shape[1], lh_norm.shape[1], hl_norm.shape[1], hh_norm.shape[1])
        result   = result[:h, :w]
        lh_norm  = lh_norm[:h, :w]
        hl_norm  = hl_norm[:h, :w]
        hh_norm  = hh_norm[:h, :w]

        top    = np.hstack([result, lh_norm])
        bottom = np.hstack([hl_norm, hh_norm])
        result = np.vstack([top, bottom])

    return result


@app.post("/api/reconstruct")
async def reconstruct_image(
    file: UploadFile = File(...),
    wavelet: str = "db4",
    levels: int = 3,
    keep_levels: int = 3
):
    """
    Decompose and reconstruct image, optionally dropping detail levels.
    Useful for demonstrating progressive reconstruction.
    """
    try:
        img_array = load_image_from_upload(file)
        
        # Decompose
        coeffs = pywt.wavedec2(img_array, wavelet, level=levels)
        
        # Zero out higher detail levels if requested
        if keep_levels < levels:
            for i in range(1, levels - keep_levels + 1):
                coeffs[i] = tuple(np.zeros_like(c) for c in coeffs[i])
        
        # Reconstruct
        reconstructed = pywt.waverec2(coeffs, wavelet)
        reconstructed = reconstructed[:img_array.shape[0], :img_array.shape[1]]
        
        # Calculate metrics
        mse = np.mean((img_array - reconstructed) ** 2)
        psnr = 10 * np.log10(255**2 / mse) if mse > 0 else float('inf')
        
        return {
            "success": True,
            "original": image_to_base64(normalize_for_display(img_array)),
            "reconstructed": image_to_base64(normalize_for_display(reconstructed)),
            "mse": float(mse),
            "psnr": float(psnr),
            "levels_used": keep_levels
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/denoise")
async def denoise_image(
    file: UploadFile = File(...),
    wavelet: str = "db4",
    levels: int = 4,
    threshold: Optional[float] = None,
    mode: str = "soft",
    add_noise: bool = False,
    noise_sigma: float = 25
):
    """
    Perform wavelet denoising.
    Optionally adds noise first for demonstration.
    """
    try:
        img_array = load_image_from_upload(file)
        original = img_array.copy()
        
        # Add noise if requested
        if add_noise:
            np.random.seed(42)
            noise = np.random.normal(0, noise_sigma, img_array.shape)
            img_array = np.clip(img_array + noise, 0, 255)
        
        # Decompose
        coeffs = pywt.wavedec2(img_array, wavelet, level=levels)
        
        # Estimate noise and compute threshold if not provided
        hh = coeffs[-1][2]  # Finest HH
        sigma = np.median(np.abs(hh)) / 0.6745
        if threshold is None:
            threshold = sigma * np.sqrt(2 * np.log(img_array.size))
        
        # Threshold detail coefficients
        thresholded = [coeffs[0]]
        for lh, hl, hh in coeffs[1:]:
            thresholded.append((
                pywt.threshold(lh, threshold, mode=mode),
                pywt.threshold(hl, threshold, mode=mode),
                pywt.threshold(hh, threshold, mode=mode)
            ))
        
        # Reconstruct
        denoised = pywt.waverec2(thresholded, wavelet)
        denoised = np.clip(denoised[:img_array.shape[0], :img_array.shape[1]], 0, 255)
        
        # Calculate metrics
        if add_noise:
            snr_before = 10 * np.log10(np.mean(original**2) / np.mean((original - img_array)**2))
            snr_after = 10 * np.log10(np.mean(original**2) / np.mean((original - denoised)**2))
        else:
            snr_before = None
            snr_after = None
        
        return {
            "success": True,
            "original": image_to_base64(normalize_for_display(original)),
            "noisy": image_to_base64(normalize_for_display(img_array)) if add_noise else None,
            "denoised": image_to_base64(normalize_for_display(denoised)),
            "estimated_sigma": float(sigma),
            "threshold_used": float(threshold),
            "snr_before": float(snr_before) if snr_before else None,
            "snr_after": float(snr_after) if snr_after else None,
            "snr_improvement": float(snr_after - snr_before) if snr_before else None
        }
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/signal-demo")
async def signal_demo(
    frequency: float = 5.0,
    samples: int = 256,
    noise_level: float = 0.3
):
    """
    Generate 1D signal demo data for wavelet visualization.
    """
    t = np.linspace(0, 1, samples)
    
    # Generate signal
    signal = np.sin(2 * np.pi * frequency * t) + 0.5 * np.sin(2 * np.pi * frequency * 2 * t)
    
    # Add noise
    np.random.seed(42)
    noisy = signal + np.random.normal(0, noise_level, samples)
    
    # Wavelet decomposition
    coeffs = pywt.wavedec(noisy, 'db4', level=4)
    
    # Denoise
    threshold = noise_level * np.sqrt(2 * np.log(samples))
    denoised_coeffs = [coeffs[0]] + [pywt.threshold(c, threshold, mode='soft') for c in coeffs[1:]]
    denoised = pywt.waverec(denoised_coeffs, 'db4')[:samples]
    
    return {
        "t": t.tolist(),
        "signal": signal.tolist(),
        "noisy": noisy.tolist(),
        "denoised": denoised.tolist(),
        "coefficients": {
            "approximation": coeffs[0].tolist(),
            "details": [c.tolist() for c in coeffs[1:]]
        }
    }


# ============================================================================
# Sample Images API
# ============================================================================

@app.get("/api/sample-images")
async def list_sample_images():
    """List available sample images from standard_test_images"""
    # Friendly names for standard test images
    FRIENDLY_NAMES = {
        "peppers_512": "Peppers",
        "baboon_512": "Baboon (Mandrill)",
        "lake_512": "Lake",
        "house_512": "House",
        # Official Kodak PhotoCD descriptions from r0k.us/graphics/kodak/PhotoCD_credits.txt
        "kodim01": "Kodak 01 - Stone Building",
        "kodim02": "Kodak 02 - Red Door",
        "kodim03": "Kodak 03 - Hats",
        "kodim04": "Kodak 04 - Portrait Girl in Red",
        "kodim05": "Kodak 05 - Motocross Bikes",
        "kodim06": "Kodak 06 - Sailboat at Anchor",
        "kodim07": "Kodak 07 - Shuttered Windows",
        "kodim08": "Kodak 08 - Market Place",
        "kodim09": "Kodak 09 - Sailboats Spinnakers",
        "kodim10": "Kodak 10 - Off-shore Sailboat Race",
        "kodim11": "Kodak 11 - Sailboat at Pier",
        "kodim12": "Kodak 12 - Couple on Beach",
        "kodim13": "Kodak 13 - Mountain Stream",
        "kodim14": "Kodak 14 - White Water Rafters",
        "kodim15": "Kodak 15 - Girl Painted Face",
        "kodim16": "Kodak 16 - Tropical Key",
        "kodim17": "Kodak 17 - Monument Cologne",
        "kodim18": "Kodak 18 - Model Black Dress",
        "kodim19": "Kodak 19 - Lighthouse Maine",
        "kodim20": "Kodak 20 - P51 Mustang",
        "kodim21": "Kodak 21 - Portland Head Light",
        "kodim22": "Kodak 22 - Barn and Pond",
        "kodim23": "Kodak 23 - Two Macaws",
        "kodim24": "Kodak 24 - Mountain Chalet",
    }
    
    images = []
    if TEST_IMAGES_DIR.exists():
        for f in sorted(TEST_IMAGES_DIR.glob("*.png")):
            stem = f.stem
            name = FRIENDLY_NAMES.get(stem, stem.replace("_", " ").title())
            with Image.open(f) as probe:
                width, height = probe.size
            images.append({
                "id": stem,
                "name": name,
                "filename": f.name,
                "width": width,
                "height": height
            })
    return {"images": images}


@app.get("/api/sample-images/{image_id}")
async def get_sample_image(image_id: str):
    """Get a sample image as base64"""
    img_path = TEST_IMAGES_DIR / f"{image_id}.png"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")
    
    img = Image.open(img_path).convert('L')
    img_array = np.array(img, dtype=np.float64)
    
    return {
        "id": image_id,
        "image": image_to_base64(normalize_for_display(img_array)),
        "shape": list(img_array.shape)
    }


@app.get("/api/sample-images/{image_id}/raw")
async def get_sample_image_raw(image_id: str):
    """Get raw image file"""
    img_path = TEST_IMAGES_DIR / f"{image_id}.png"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")
    return FileResponse(img_path, media_type="image/png")


@app.get("/api/sample-images/{image_id}/grayscale")
async def get_sample_image_grayscale(image_id: str, size: int = 64):
    """
    Get grayscale pixel data resized to specified size.
    Used for wavelet decomposition demos.
    """
    img_path = TEST_IMAGES_DIR / f"{image_id}.png"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")
    
    # Clamp size
    size = max(8, min(256, size))
    
    img = Image.open(img_path).convert('L')
    img = img.resize((size, size), Image.Resampling.LANCZOS)
    pixels = np.array(img, dtype=np.float64).tolist()
    
    return {
        "id": image_id,
        "size": size,
        "pixels": pixels  # 2D array of grayscale values
    }


# ============================================================================
# Sprite Images API (Educational - small pixel art for kernel demos)
# ============================================================================

SPRITE_IMAGES_DIR = DATA_DIR / "sprite_images"

@app.get("/api/sprite-images")
async def list_sprite_images():
    """List available sprite images for educational kernel demos"""
    SPRITE_NAMES = {
        "block": "Question Block",
        "heart": "Heart",
        "star": "Star",
        "coin": "Coin",
        "mushroom": "Mushroom",
        "ghost": "Ghost",
        "tree": "Tree",
        "sword": "Sword",
        "potion": "Potion",
        "checker_color": "Color Checker",
        "rainbow": "Rainbow",
        "smiley": "Smiley",
    }
    
    images = []
    if SPRITE_IMAGES_DIR.exists():
        for f in sorted(SPRITE_IMAGES_DIR.glob("*.png")):
            stem = f.stem
            # Parse name_size format
            parts = stem.rsplit("_", 1)
            if len(parts) == 2:
                name, size = parts[0], parts[1]
                friendly = SPRITE_NAMES.get(name, name.replace("_", " ").title())
                images.append({
                    "id": stem,
                    "name": f"{friendly} ({size}×{size})",
                    "baseName": name,
                    "size": int(size),
                    "filename": f.name
                })
    return {"images": images}


@app.get("/api/sprite-images/{image_id}")
async def get_sprite_image(image_id: str, scale_to: int = 512):
    """
    Get a sprite image scaled to display size using nearest neighbor.
    Preserves pixel art crisp edges.
    """
    img_path = SPRITE_IMAGES_DIR / f"{image_id}.png"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Sprite {image_id} not found")
    
    img = Image.open(img_path).convert('RGB')
    original_size = img.size[0]  # Assume square
    
    # Scale with nearest neighbor to preserve pixel art
    if scale_to and scale_to != original_size:
        img = img.resize((scale_to, scale_to), Image.Resampling.NEAREST)
    
    # Convert to base64
    buffered = io.BytesIO()
    img.save(buffered, format="PNG")
    img_base64 = base64.b64encode(buffered.getvalue()).decode()
    
    return {
        "id": image_id,
        "image": img_base64,
        "originalSize": original_size,
        "displaySize": scale_to,
        "shape": [scale_to, scale_to, 3]
    }


@app.get("/api/sprite-images/{image_id}/pixels")
async def get_sprite_pixels(image_id: str):
    """
    Get raw pixel data for a sprite (unscaled).
    Returns the actual pixel values for educational visualization.
    """
    img_path = SPRITE_IMAGES_DIR / f"{image_id}.png"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Sprite {image_id} not found")
    
    img = Image.open(img_path).convert('RGB')
    pixels = np.array(img)
    
    return {
        "id": image_id,
        "size": img.size[0],
        "pixels": pixels.tolist()  # 3D array: [row][col][rgb]
    }


@app.get("/api/sprite-images/{image_id}/grayscale")
async def get_sprite_grayscale(image_id: str, size: int = 8):
    """
    Get grayscale pixel data for a sprite, resized to specified size.
    Used for educational wavelet demos on small patches.
    """
    img_path = SPRITE_IMAGES_DIR / f"{image_id}.png"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Sprite {image_id} not found")
    
    # Clamp size for educational use
    size = max(4, min(64, size))
    
    img = Image.open(img_path).convert('L')
    img = img.resize((size, size), Image.Resampling.NEAREST)  # NEAREST for pixel art
    pixels = np.array(img, dtype=np.float64).tolist()
    
    return {
        "id": image_id,
        "size": size,
        "pixels": pixels
    }


# ============================================================================
# Fourier Transform API
# ============================================================================

@app.get("/api/fourier/function")
async def fourier_function(
    expression: str = "sin(2*pi*5*t) + sin(2*pi*12*t)",
    samples: int = 512,
    duration: float = 1.0
):
    """
    Compute Fourier transform of a mathematical expression.
    Supports: sin, cos, exp, pi, abs, sqrt, t (time variable)
    """
    from numpy import sin, cos, exp, pi, abs, sqrt
    
    try:
        t = np.linspace(0, duration, samples)
        
        # Evaluate expression safely
        allowed_names = {
            "sin": np.sin, "cos": np.cos, "exp": np.exp,
            "pi": np.pi, "abs": np.abs, "sqrt": np.sqrt,
            "t": t
        }
        signal = eval(expression, {"__builtins__": {}}, allowed_names)
        
        # Compute FFT
        fft = np.fft.fft(signal)
        freqs = np.fft.fftfreq(samples, duration / samples)
        
        # Only positive frequencies
        pos_mask = freqs >= 0
        freqs_pos = freqs[pos_mask]
        magnitude = np.abs(fft[pos_mask]) * 2 / samples
        phase = np.angle(fft[pos_mask])
        
        return {
            "success": True,
            "expression": expression,
            "time": {
                "t": t.tolist(),
                "signal": signal.tolist()
            },
            "frequency": {
                "f": freqs_pos.tolist(),
                "magnitude": magnitude.tolist(),
                "phase": phase.tolist()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error evaluating expression: {str(e)}")


@app.get("/api/fourier/image")
async def fourier_image_sample(image_id: str = "lena_512"):
    """Compute 2D Fourier transform of a sample image"""
    img_path = TEST_IMAGES_DIR / f"{image_id}.png"
    if not img_path.exists():
        # Try without _512 suffix
        img_path = TEST_IMAGES_DIR / f"{image_id}.png"
        if not img_path.exists():
            raise HTTPException(status_code=404, detail=f"Image {image_id} not found")
    
    img = Image.open(img_path).convert('L')
    img_array = np.array(img, dtype=np.float64)
    
    # Compute 2D FFT
    fft2 = np.fft.fft2(img_array)
    fft2_shifted = np.fft.fftshift(fft2)
    
    # Magnitude spectrum (log scale for visibility)
    magnitude = np.log1p(np.abs(fft2_shifted))
    phase = np.angle(fft2_shifted)
    
    return {
        "success": True,
        "original": image_to_base64(normalize_for_display(img_array)),
        "magnitude": image_to_base64(normalize_for_display(magnitude)),
        "phase": image_to_base64(normalize_for_display(phase)),
        "shape": list(img_array.shape)
    }


# ============================================================================
# Filter Visualization API  
# ============================================================================

# ============================================================================
# Filter frequency response
# ============================================================================

# Gaussian exponent that puts |H| at 1/sqrt(2) on the cutoff, matching the -3 dB
# convention the ideal and Butterworth shapes already use.
GAUSS_3DB = np.log(2.0) / 2.0


def lowpass_magnitude(freqs_hz: np.ndarray, cutoff_hz: float, shape: str, order: int) -> np.ndarray:
    """|H(f)| of a low-pass of the given shape, -3 dB at cutoff_hz."""
    f = np.abs(np.asarray(freqs_hz, dtype=np.float64))
    if cutoff_hz <= 0:
        return np.zeros_like(f)
    if shape == "butterworth":
        return 1.0 / np.sqrt(1.0 + (f / cutoff_hz) ** (2 * max(1, min(int(order), 16))))
    if shape == "gaussian":
        return np.exp(-GAUSS_3DB * (f / cutoff_hz) ** 2)
    return np.where(f <= cutoff_hz, 1.0, 0.0)


def power_complement(magnitude: np.ndarray) -> np.ndarray:
    """The partner response satisfying |H_lp|^2 + |H_hp|^2 = 1, so both are -3 dB
    at the same cutoff whatever the shape."""
    return np.sqrt(np.clip(1.0 - magnitude ** 2, 0.0, 1.0))


def filter_magnitude(freqs_hz, band: str, shape: str, order: int,
                     cutoff_hz: float = 30.0,
                     low_cutoff_hz: float = 20.0,
                     high_cutoff_hz: float = 60.0) -> np.ndarray:
    """|H(f)| for the filter the UI is showing.

    One definition serves both the drawn response curve and the filter applied to
    a signal, so the demo cannot display one filter while computing another.
    `band` is lowpass / highpass / bandpass; `shape` is ideal / butterworth /
    gaussian and only changes how steeply the response rolls off.
    """
    if band == "lowpass":
        return lowpass_magnitude(freqs_hz, cutoff_hz, shape, order)
    if band == "highpass":
        return power_complement(lowpass_magnitude(freqs_hz, cutoff_hz, shape, order))
    if band == "bandpass":
        above_low = power_complement(lowpass_magnitude(freqs_hz, low_cutoff_hz, shape, order))
        return above_low * lowpass_magnitude(freqs_hz, high_cutoff_hz, shape, order)
    return np.ones_like(np.asarray(freqs_hz, dtype=np.float64))


@app.get("/api/filters/lowpass")
async def lowpass_filter_demo(
    cutoff_hz: float = 30.0,
    filter_type: str = "ideal",
    order: int = 4,
    samples: int = 256,
    max_freq_hz: float = 100.0
):
    """
    Demonstrate low-pass filter in frequency domain.
    cutoff_hz: Cutoff frequency in Hz
    order: Filter order for Butterworth (1, 2, 4, 8)
    max_freq_hz: Maximum frequency to display (Hz)
    filter_type here names the SHAPE: ideal, butterworth, gaussian
    """
    # Work in Hz directly
    freqs_hz = np.linspace(0, max_freq_hz, samples)
    response = filter_magnitude(freqs_hz, "lowpass", filter_type, order, cutoff_hz=cutoff_hz)

    # Impulse response (inverse FFT of frequency response)
    full_response = np.concatenate([response, response[::-1][1:-1]])
    impulse = np.real(np.fft.ifft(full_response))
    impulse = np.fft.fftshift(impulse)
    t_impulse = np.linspace(-1, 1, len(impulse))
    
    return {
        "type": filter_type,
        "cutoff_hz": cutoff_hz,
        "frequency": {
            "f": freqs_hz.tolist(),  # Already in Hz
            "response": response.tolist()
        },
        "impulse": {
            "t": t_impulse.tolist(),
            "h": impulse.tolist()
        }
    }


@app.get("/api/filters/highpass")
async def highpass_filter_demo(
    cutoff_hz: float = 30.0,
    filter_type: str = "ideal",
    order: int = 4,
    samples: int = 256,
    max_freq_hz: float = 100.0
):
    """
    Demonstrate high-pass filter in frequency domain.
    cutoff_hz: Cutoff frequency in Hz
    order: Filter order for Butterworth (1, 2, 4, 8)
    filter_type here names the SHAPE: ideal, butterworth, gaussian
    """
    # Work in Hz directly
    freqs_hz = np.linspace(0, max_freq_hz, samples)
    response = filter_magnitude(freqs_hz, "highpass", filter_type, order, cutoff_hz=cutoff_hz)

    # Impulse response
    full_response = np.concatenate([response, response[::-1][1:-1]])
    impulse = np.real(np.fft.ifft(full_response))
    impulse = np.fft.fftshift(impulse)
    t_impulse = np.linspace(-1, 1, len(impulse))
    
    return {
        "type": filter_type,
        "cutoff_hz": cutoff_hz,
        "frequency": {
            "f": freqs_hz.tolist(),  # Already in Hz
            "response": response.tolist()
        },
        "impulse": {
            "t": t_impulse.tolist(),
            "h": impulse.tolist()
        }
    }


@app.get("/api/filters/bandpass")
async def bandpass_filter_demo(
    low_cutoff_hz: float = 20.0,
    high_cutoff_hz: float = 60.0,
    filter_type: str = "ideal",
    order: int = 4,
    samples: int = 256,
    max_freq_hz: float = 100.0
):
    """Demonstrate band-pass filter in Hz. filter_type here names the SHAPE."""
    freqs_hz = np.linspace(0, max_freq_hz, samples)
    response = filter_magnitude(
        freqs_hz, "bandpass", filter_type, order,
        low_cutoff_hz=low_cutoff_hz, high_cutoff_hz=high_cutoff_hz
    )

    return {
        "type": filter_type,
        "low_cutoff_hz": low_cutoff_hz,
        "high_cutoff_hz": high_cutoff_hz,
        "order": order,
        "frequency": {
            "f": freqs_hz.tolist(),
            "response": response.tolist()
        }
    }


@app.get("/api/filters/apply-signal")
async def apply_filter_to_signal(
    expression: str = "sin(2*pi*5*t) + sin(2*pi*20*t) + sin(2*pi*50*t)",
    filter_type: str = "lowpass",
    shape: str = "ideal",
    order: int = 4,
    cutoff_hz: float = 30.0,
    low_cutoff_hz: float = 20.0,
    high_cutoff_hz: float = 60.0,
    samples: int = 512
):
    """
    Apply a filter to a signal and show before/after.
    filter_type: lowpass / highpass / bandpass (which band survives)
    shape: ideal / butterworth / gaussian (how steeply the response rolls off)
    order: Butterworth order
    cutoff_hz: Cutoff frequency in Hz for lowpass/highpass
    low_cutoff_hz, high_cutoff_hz: Cutoff frequencies for bandpass
    """
    try:
        # samples over 1 second means sample_rate = samples
        sample_rate = samples
        
        t = np.linspace(0, 1, samples)
        allowed_names = {"sin": np.sin, "cos": np.cos, "exp": np.exp, "pi": np.pi, "t": t}
        signal = eval(expression, {"__builtins__": {}}, allowed_names)
        
        # FFT
        fft = np.fft.fft(signal)
        freqs_normalized = np.fft.fftfreq(samples)  # Normalized: 1.0 = sample_rate
        freqs_hz = freqs_normalized * sample_rate    # Convert to Hz
        
        # The magnitude response drawn next to this plot is the one applied here.
        # It is real and even in frequency, so the filtered signal stays real and
        # the filter stays zero-phase.
        filt = filter_magnitude(
            freqs_hz, filter_type, shape, order,
            cutoff_hz=cutoff_hz, low_cutoff_hz=low_cutoff_hz, high_cutoff_hz=high_cutoff_hz
        )

        filtered_fft = fft * filt
        filtered_signal = np.real(np.fft.ifft(filtered_fft))
        
        # Magnitude spectra (positive frequencies only)
        mag_original = np.abs(fft[:samples//2]) * 2 / samples
        mag_filtered = np.abs(filtered_fft[:samples//2]) * 2 / samples
        freqs_hz_pos = freqs_hz[:samples//2]  # Already in Hz
        
        return {
            "success": True,
            "filter": {
                "type": filter_type,
                "shape": shape,
                "order": order,
                "cutoff_hz": cutoff_hz,
                "response": filt[:samples//2].tolist()
            },
            "time": {
                "t": t.tolist(),
                "original": signal.tolist(),
                "filtered": filtered_signal.tolist()
            },
            "frequency": {
                "f": freqs_hz_pos.tolist(),  # Already in Hz
                "original_magnitude": mag_original.tolist(),
                "filtered_magnitude": mag_filtered.tolist()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# Wavelet Basis Visualization
# ============================================================================

@app.get("/api/wavelet-basis")
async def wavelet_basis(wavelet: str = "db4", samples: int = 128):
    """Get wavelet and scaling function for visualization"""
    try:
        wav = pywt.Wavelet(wavelet)
        
        # Get wavelet and scaling functions
        phi, psi, x = wav.wavefun(level=8)
        
        # Resample to requested number of samples
        indices = np.linspace(0, len(x) - 1, samples).astype(int)
        
        return {
            "wavelet": wavelet,
            "name": wav.name,
            "family": wav.family_name,
            "x": x[indices].tolist(),
            "scaling_function": phi[indices].tolist(),  # φ (phi) - low-pass
            "wavelet_function": psi[indices].tolist(),  # ψ (psi) - high-pass
            "properties": {
                "filter_length": wav.dec_len,
                "symmetry": wav.symmetry,
                "orthogonal": wav.orthogonal,
                "biorthogonal": wav.biorthogonal
            },
            "filters": {
                "dec_lo": np.asarray(wav.dec_lo).tolist(),
                "dec_hi": np.asarray(wav.dec_hi).tolist(),
                "rec_lo": np.asarray(wav.rec_lo).tolist(),
                "rec_hi": np.asarray(wav.rec_hi).tolist()
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/wavelet-families")
async def wavelet_families():
    """List all available wavelet families"""
    families = {}
    for family in pywt.families():
        wavelets = pywt.wavelist(family)
        families[family] = {
            "name": family,
            "wavelets": wavelets,
            "description": get_family_description(family)
        }
    return families


def get_family_description(family: str) -> str:
    descriptions = {
        "haar": "Simplest wavelet, discontinuous, good for sharp transitions",
        "db": "Daubechies - compact support, orthogonal, varying smoothness",
        "sym": "Symlets - near-symmetric Daubechies wavelets",
        "coif": "Coiflets - symmetric scaling function, good for signal features",
        "bior": "Biorthogonal - symmetric, used in JPEG2000",
        "rbio": "Reverse biorthogonal wavelets",
        "dmey": "Discrete Meyer wavelet - smooth in frequency domain",
        "gaus": "Gaussian wavelets - continuous wavelet analysis",
        "mexh": "Mexican hat wavelet - second derivative of Gaussian",
        "morl": "Morlet wavelet - complex wavelet for time-frequency analysis"
    }
    return descriptions.get(family, "")


# ============================================================================
# Decompose with Sample Image (no upload needed)
# ============================================================================

@app.get("/api/decompose-sample/{image_id}")
async def decompose_sample_image(
    image_id: str,
    wavelet: str = "db4",
    levels: int = 3
):
    """Decompose a sample image without upload"""
    img_path = TEST_IMAGES_DIR / f"{image_id}.png"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")
    
    img = Image.open(img_path).convert('L')
    img_array = np.array(img, dtype=np.float64)
    
    # Perform decomposition
    coeffs = pywt.wavedec2(img_array, wavelet, level=levels)
    
    # Extract subbands
    subbands = {}
    ll = coeffs[0]
    subbands["LL"] = {
        "image": image_to_base64(normalize_for_display(ll)),
        "shape": list(ll.shape),
        "energy": float(np.sum(ll**2))
    }
    
    for i, (lh, hl, hh) in enumerate(coeffs[1:], 1):
        level = levels - i + 1
        for name, arr in [("LH", lh), ("HL", hl), ("HH", hh)]:
            subbands[f"{name}{level}"] = {
                "image": image_to_base64(normalize_for_display(arr)),
                "shape": list(arr.shape),
                "energy": float(np.sum(arr**2))
            }
    
    composite = create_wavelet_composite(coeffs)
    
    return {
        "success": True,
        "image_id": image_id,
        "original": image_to_base64(normalize_for_display(img_array)),
        "original_shape": list(img_array.shape),
        "wavelet": wavelet,
        "levels": levels,
        "subbands": subbands,
        "composite": image_to_base64(composite)
    }


# ============================================================================
# DCT vs wavelet, compared at equal bitrate
# ============================================================================

JPEG_Q50 = np.array([
    [16, 11, 10, 16, 24, 40, 51, 61],
    [12, 12, 14, 19, 26, 58, 60, 55],
    [14, 13, 16, 24, 40, 57, 69, 56],
    [14, 17, 22, 29, 51, 87, 80, 62],
    [18, 22, 37, 56, 68, 109, 103, 77],
    [24, 35, 55, 64, 81, 104, 113, 92],
    [49, 64, 78, 87, 103, 121, 120, 101],
    [72, 92, 95, 98, 112, 100, 103, 99]
], dtype=np.float64)


def jpeg_quant_matrix(quality: int) -> np.ndarray:
    """Annex K luminance table scaled by the IJG quality rule."""
    quality = int(np.clip(quality, 1, 100))
    scale = 5000 / quality if quality < 50 else 200 - 2 * quality
    return np.clip(np.floor((JPEG_Q50 * scale + 50) / 100), 1, 255)


def entropy_bits(symbols: np.ndarray) -> float:
    """Bits for these quantized symbols under a zero-order entropy coder.

    Not a real codec - a real JPEG or JPEG2000 file is smaller. It is the same
    estimator on both sides, which is what makes the two bitrates comparable.
    """
    flat = np.asarray(symbols, dtype=np.int64).ravel()
    if flat.size == 0:
        return 0.0
    counts = np.bincount(flat - flat.min())
    counts = counts[counts > 0]
    p = counts / flat.size
    return float(-np.sum(p * np.log2(p))) * flat.size


def compute_ssim(a: np.ndarray, b: np.ndarray, data_range: float = 255.0) -> float:
    """Mean SSIM over a 7x7 window, Wang et al. 2004 constants."""
    from scipy.ndimage import uniform_filter

    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    c1 = (0.01 * data_range) ** 2
    c2 = (0.03 * data_range) ** 2
    win = 7
    unbias = win * win / (win * win - 1)

    mu_a = uniform_filter(a, win)
    mu_b = uniform_filter(b, win)
    var_a = (uniform_filter(a * a, win) - mu_a ** 2) * unbias
    var_b = (uniform_filter(b * b, win) - mu_b ** 2) * unbias
    cov = (uniform_filter(a * b, win) - mu_a * mu_b) * unbias

    num = (2 * mu_a * mu_b + c1) * (2 * cov + c2)
    den = (mu_a ** 2 + mu_b ** 2 + c1) * (var_a + var_b + c2)
    return float(np.mean(num / den))


def jpeg_like_compress(img_array: np.ndarray, quality: int):
    """Baseline JPEG path: 8x8 DCT, Annex K quantization, inverse. Returns the
    reconstruction and the estimated bit cost of the quantized coefficients."""
    from scipy.fftpack import dct, idct

    block = 8
    h, w = img_array.shape
    padded = np.pad(img_array,
                    ((0, (block - h % block) % block), (0, (block - w % block) % block)),
                    mode='edge')
    quant = jpeg_quant_matrix(quality)

    result = np.zeros_like(padded)
    symbols = np.zeros_like(padded)
    for i in range(0, padded.shape[0], block):
        for j in range(0, padded.shape[1], block):
            tile = padded[i:i+block, j:j+block] - 128
            coeff = dct(dct(tile.T, norm='ortho').T, norm='ortho')
            levels = np.round(coeff / quant)
            symbols[i:i+block, j:j+block] = levels
            restored = idct(idct((levels * quant).T, norm='ortho').T, norm='ortho') + 128
            result[i:i+block, j:j+block] = restored

    return np.clip(result[:h, :w], 0, 255), entropy_bits(symbols)


def flatten_bands(coeffs):
    """wavedec2 output as a flat list: approximation first, then each level's
    horizontal / vertical / diagonal detail."""
    bands = [coeffs[0]]
    for detail in coeffs[1:]:
        bands.extend(detail)
    return bands


def rebuild_coeffs(bands):
    """Inverse of flatten_bands."""
    out = [bands[0]]
    for i in range(1, len(bands), 3):
        out.append(tuple(bands[i:i + 3]))
    return out


_synthesis_gain_cache = {}


def synthesis_gains(wavelet: str, levels: int, shape) -> list:
    """L2 norm of each subband's synthesis basis function.

    A biorthogonal transform is not orthonormal, so a coefficient error of 1 in
    one subband reaches the image with a different magnitude than in another.
    Dividing the quantization step by this gain equalises the error each subband
    contributes, which is what JPEG2000 does with its per-band step sizes.
    """
    key = (wavelet, levels, shape)
    if key in _synthesis_gain_cache:
        return _synthesis_gain_cache[key]

    template = flatten_bands(pywt.wavedec2(np.zeros(shape), wavelet, level=levels))
    gains = []
    for index in range(len(template)):
        probe = [np.zeros_like(band) for band in template]
        target = probe[index]
        target[target.shape[0] // 2, target.shape[1] // 2] = 1.0
        impulse = pywt.waverec2(rebuild_coeffs(probe), wavelet)
        gains.append(float(np.sqrt(np.sum(impulse ** 2))) or 1.0)

    _synthesis_gain_cache[key] = gains
    return gains


def wavelet_compress_at_budget(img_array: np.ndarray, wavelet: str, levels: int, bit_budget: float):
    """Quantize the wavelet coefficients as coarsely as needed to fit the budget.

    Dead-zone quantizer with per-subband steps, as in JPEG2000: anything below a
    full step is dropped, and each subband's step is scaled by its synthesis
    gain. The step search needs only the forward transform, so the synthesis
    runs once, at the end.
    """
    coeffs = pywt.wavedec2(img_array, wavelet, level=levels)
    bands = flatten_bands(coeffs)
    gains = synthesis_gains(wavelet, levels, img_array.shape)

    def quantize(base_step):
        return [np.sign(band) * np.floor(np.abs(band) / (base_step / gain))
                for band, gain in zip(bands, gains)]

    def bits_at(base_step):
        return entropy_bits(np.concatenate([q.ravel() for q in quantize(base_step)]))

    low, high = 0.02, 8192.0
    step = high
    for _ in range(30):
        mid = np.sqrt(low * high)
        if bits_at(mid) > bit_budget:
            low = mid          # too expensive, quantize coarser
        else:
            high = mid
            step = mid
        if high / low < 1.002:
            break

    quantized = quantize(step)
    # JPEG2000 reconstructs a dead-zone bin at its midpoint, not its edge.
    restored_bands = [
        np.sign(q) * (np.abs(q) + 0.5) * (step / gain)
        for q, gain in zip(quantized, gains)
    ]
    restored = pywt.waverec2(rebuild_coeffs(restored_bands), wavelet)
    h, w = img_array.shape
    bits = entropy_bits(np.concatenate([q.ravel() for q in quantized]))
    return np.clip(restored[:h, :w], 0, 255), bits, float(step)


@app.get("/api/compare-sample/{image_id}")
async def compare_sample_image(
    image_id: str,
    quality: int = 50,
    wavelet: str = "bior4.4",
    levels: int = 4
):
    """Compare DCT vs wavelet on a sample image, at equal estimated bitrate.

    Quality sets the JPEG quantization table; the wavelet side is then given the
    same bit budget instead of a second, differently calibrated quality knob.
    """
    img_path = TEST_IMAGES_DIR / f"{image_id}.png"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")

    img_array = np.array(Image.open(img_path).convert('L'), dtype=np.float64)
    pixels = img_array.size

    dct_result, dct_bits = jpeg_like_compress(img_array, quality)
    wavelet_result, wavelet_bits, step = wavelet_compress_at_budget(
        img_array, wavelet, levels, dct_bits)

    def quality_metrics(reconstruction, bits):
        mse = float(np.mean((img_array - reconstruction) ** 2))
        return {
            "mse": mse,
            "psnr": float(10 * np.log10(255 ** 2 / mse)) if mse > 0 else float('inf'),
            "ssim": compute_ssim(img_array, reconstruction),
            "bpp": float(bits / pixels)
        }

    return {
        "success": True,
        "image_id": image_id,
        "original": image_to_base64(normalize_for_display(img_array)),
        "dct_result": image_to_base64(normalize_for_display(dct_result)),
        "wavelet_result": image_to_base64(normalize_for_display(wavelet_result)),
        "quality": quality,
        "rate_matched": True,
        "target_bpp": float(dct_bits / pixels),
        "wavelet_step": step,
        "metrics": {
            "dct": quality_metrics(dct_result, dct_bits),
            "wavelet": quality_metrics(wavelet_result, wavelet_bits)
        }
    }


@app.get("/api/ecg-demo")
async def ecg_demo(
    noise_sigma: float = 0.25,
    wavelet: str = "db4",
    levels: int = 5,
    beats: int = 6,
    fs: int = 200
):
    """Synthetic PQRST ECG + muscle-noise + wavelet denoising + R-peak detection.

    Demonstrates the Apple Watch / Holter use case: detect heartbeats in a
    noisy single-lead ECG. The PQRST complex is modeled as a sum of Gaussians
    per beat (standard synthetic-ECG approximation).
    """
    beats = max(2, min(12, beats))
    beat_dur = 0.8  # seconds per beat (75 BPM)
    n = int(beats * beat_dur * fs)
    t = np.arange(n) / fs

    # (offset within beat [s], width [s], amplitude) for P, Q, R, S, T waves
    pqrst = [
        (0.10, 0.025, 0.15),
        (0.16, 0.010, -0.10),
        (0.18, 0.012, 1.00),
        (0.20, 0.010, -0.25),
        (0.34, 0.040, 0.30),
    ]
    clean = np.zeros(n)
    for b in range(beats):
        t0 = b * beat_dur
        for off, w, amp in pqrst:
            clean += amp * np.exp(-((t - (t0 + off)) ** 2) / (2 * w * w))

    np.random.seed(7)
    noisy = clean + np.random.normal(0, noise_sigma, n)

    # 1D wavelet denoising with the universal (Donoho) threshold
    levels = max(1, min(pywt.dwt_max_level(n, wavelet), levels))
    coeffs = pywt.wavedec(noisy, wavelet, level=levels)
    sigma = np.median(np.abs(coeffs[-1])) / 0.6745
    threshold = sigma * np.sqrt(2 * np.log(n))
    den_coeffs = [coeffs[0]] + [pywt.threshold(c, threshold, mode="soft") for c in coeffs[1:]]
    denoised = pywt.waverec(den_coeffs, wavelet)[:n]

    # R-peak detection on the denoised signal: max per beat window
    r_peaks = []
    for b in range(beats):
        lo = int(b * beat_dur * fs)
        hi = min(n, int((b + 1) * beat_dur * fs))
        r_peaks.append(int(lo + np.argmax(denoised[lo:hi])))

    # Heart rate from median R-R interval
    rr = np.diff(np.array(r_peaks)) / fs
    bpm = float(60.0 / np.median(rr)) if len(rr) > 0 else None

    snr_before = 10 * np.log10(np.mean(clean ** 2) / (np.mean((clean - noisy) ** 2) + 1e-12))
    snr_after = 10 * np.log10(np.mean(clean ** 2) / (np.mean((clean - denoised) ** 2) + 1e-12))

    return {
        "t": t.tolist(),
        "clean": clean.tolist(),
        "noisy": noisy.tolist(),
        "denoised": denoised.tolist(),
        "r_peaks": r_peaks,
        "r_peak_values": [float(denoised[p]) for p in r_peaks],
        "bpm": bpm,
        "threshold_used": float(threshold),
        "snr_before": float(snr_before),
        "snr_after": float(snr_after),
        "snr_improvement": float(snr_after - snr_before)
    }


@app.get("/api/denoise-sample/{image_id}")
async def denoise_sample_image(
    image_id: str,
    wavelet: str = "db4",
    levels: int = 4,
    threshold: Optional[float] = None,
    mode: str = "soft",
    add_noise: bool = True,
    noise_sigma: float = 25
):
    """Denoise a sample image without upload"""
    img_path = TEST_IMAGES_DIR / f"{image_id}.png"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")
    
    img = Image.open(img_path).convert('L')
    img_array = np.array(img, dtype=np.float64)
    original = img_array.copy()
    
    # Add noise if requested
    if add_noise:
        np.random.seed(42)
        noise = np.random.normal(0, noise_sigma, img_array.shape)
        img_array = np.clip(img_array + noise, 0, 255)
    
    # Decompose
    coeffs = pywt.wavedec2(img_array, wavelet, level=levels)

    # Estimate noise and compute threshold if not provided.
    # 2*sigma instead of the Donoho universal threshold: for images,
    # sigma*sqrt(2 ln N) (~68 at sigma=15, N=512^2) oversmooths so hard
    # that the SNR gain drops to ~0 dB; 2*sigma keeps detail and gains ~3 dB.
    hh = coeffs[-1][2]  # Finest HH
    sigma = np.median(np.abs(hh)) / 0.6745
    if threshold is None:
        threshold = 2.0 * sigma

    # Threshold detail coefficients
    thresholded = [coeffs[0]]
    for lh, hl, hh in coeffs[1:]:
        thresholded.append((
            pywt.threshold(lh, threshold, mode=mode),
            pywt.threshold(hl, threshold, mode=mode),
            pywt.threshold(hh, threshold, mode=mode)
        ))

    # Reconstruct
    denoised = pywt.waverec2(thresholded, wavelet)
    denoised = np.clip(denoised[:img_array.shape[0], :img_array.shape[1]], 0, 255)

    # Calculate metrics
    if add_noise:
        snr_before = 10 * np.log10(np.mean(original**2) / np.mean((original - img_array)**2))
        snr_after = 10 * np.log10(np.mean(original**2) / np.mean((original - denoised)**2))
    else:
        snr_before = None
        snr_after = None

    # What the algorithm removed, amplified 10x for visibility.
    # Fixed scaling (not min-max normalization) so the slider settings
    # are visually comparable between runs.
    difference = np.clip(np.abs(img_array - denoised) * 10, 0, 255).astype(np.uint8)

    return {
        "success": True,
        "image_id": image_id,
        "original": image_to_base64(normalize_for_display(original)),
        "noisy": image_to_base64(normalize_for_display(img_array)) if add_noise else None,
        "denoised": image_to_base64(normalize_for_display(denoised)),
        "difference": image_to_base64(difference),
        "estimated_sigma": float(sigma),
        "threshold_used": float(threshold),
        "snr_before": float(snr_before) if snr_before else None,
        "snr_after": float(snr_after) if snr_after else None,
        "snr_improvement": float(snr_after - snr_before) if snr_before else None
    }


# ============================================================================
# Image Kernels / Convolution API
# ============================================================================

# Predefined kernels
KERNELS = {
    "identity": {
        "name": "Identity",
        "description": "No change - passes through the original image",
        "matrix": [[0, 0, 0], [0, 1, 0], [0, 0, 0]]
    },
    "blur_box": {
        "name": "Box Blur",
        "description": "Simple averaging blur - each pixel becomes average of neighbors",
        "matrix": [[1/9, 1/9, 1/9], [1/9, 1/9, 1/9], [1/9, 1/9, 1/9]]
    },
    "blur_gaussian": {
        "name": "Gaussian Blur",
        "description": "Weighted blur - center pixels have more influence (σ≈1)",
        "matrix": [[1/16, 2/16, 1/16], [2/16, 4/16, 2/16], [1/16, 2/16, 1/16]]
    },
    "sharpen": {
        "name": "Sharpen",
        "description": "Enhances edges by amplifying differences from neighbors",
        "matrix": [[0, -1, 0], [-1, 5, -1], [0, -1, 0]]
    },
    "sharpen_strong": {
        "name": "Strong Sharpen",
        "description": "More aggressive sharpening with diagonal neighbors",
        "matrix": [[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]]
    },
    "edge_laplacian": {
        "name": "Laplacian Edge",
        "description": "Detects edges in all directions using second derivative",
        "matrix": [[0, -1, 0], [-1, 4, -1], [0, -1, 0]]
    },
    "edge_laplacian_diag": {
        "name": "Laplacian (Diagonal)",
        "description": "Laplacian including diagonal neighbors",
        "matrix": [[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]]
    },
    "edge_sobel_x": {
        "name": "Sobel X (Vertical edges)",
        "description": "Detects vertical edges using horizontal gradient",
        "matrix": [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]]
    },
    "edge_sobel_y": {
        "name": "Sobel Y (Horizontal edges)",
        "description": "Detects horizontal edges using vertical gradient",
        "matrix": [[-1, -2, -1], [0, 0, 0], [1, 2, 1]]
    },
    "edge_prewitt_x": {
        "name": "Prewitt X",
        "description": "Simpler vertical edge detection",
        "matrix": [[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]]
    },
    "edge_prewitt_y": {
        "name": "Prewitt Y",
        "description": "Simpler horizontal edge detection",
        "matrix": [[-1, -1, -1], [0, 0, 0], [1, 1, 1]]
    },
    "emboss": {
        "name": "Emboss",
        "description": "Creates 3D shadow effect - highlights edges with direction",
        "matrix": [[-2, -1, 0], [-1, 1, 1], [0, 1, 2]]
    },
    "emboss_strong": {
        "name": "Strong Emboss",
        "description": "More pronounced emboss effect",
        "matrix": [[-2, -2, 0], [-2, 6, 0], [0, 0, 0]]
    },
    "outline": {
        "name": "Outline",
        "description": "Extracts object outlines",
        "matrix": [[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]]
    }
}


@app.get("/api/kernels")
async def list_kernels():
    """List all available convolution kernels"""
    return {
        "kernels": [
            {"id": k, "name": v["name"], "description": v["description"]}
            for k, v in KERNELS.items()
        ]
    }


@app.get("/api/kernels/{kernel_id}")
async def get_kernel(kernel_id: str):
    """Get details of a specific kernel"""
    if kernel_id not in KERNELS:
        raise HTTPException(status_code=404, detail=f"Kernel {kernel_id} not found")
    
    kernel = KERNELS[kernel_id]
    return {
        "id": kernel_id,
        "name": kernel["name"],
        "description": kernel["description"],
        "matrix": kernel["matrix"],
        "size": len(kernel["matrix"])
    }


@app.get("/api/kernels/apply/{image_id}")
async def apply_kernel_to_image(
    image_id: str,
    kernel_id: str = "blur_gaussian",
    strength: float = 1.0,
    grayscale: bool = False,
    kernel_size: int = 3
):
    """
    Apply a convolution kernel to a sample image (color or grayscale).
    Strength interpolates between original (0) and full kernel effect (1+).
    kernel_size: 3, 4, or 5 - will resize kernel accordingly
    """
    from scipy.ndimage import convolve
    
    # Validate kernel
    if kernel_id not in KERNELS:
        raise HTTPException(status_code=404, detail=f"Kernel {kernel_id} not found")
    
    # Load image
    img_path = TEST_IMAGES_DIR / f"{image_id}.png"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")
    
    # Load as color or grayscale
    if grayscale:
        img = Image.open(img_path).convert('L')
        img_array = np.array(img, dtype=np.float64)
        is_color = False
    else:
        img = Image.open(img_path).convert('RGB')
        img_array = np.array(img, dtype=np.float64)
        is_color = True
    
    # Get kernel matrix and resize if needed
    kernel_data = KERNELS[kernel_id]
    base_matrix = np.array(kernel_data["matrix"], dtype=np.float64)
    
    # Resize kernel if requested
    if kernel_size != 3:
        kernel_matrix = resize_kernel(base_matrix, kernel_size)
    else:
        kernel_matrix = base_matrix
    
    # Apply convolution
    if is_color:
        # Apply to each channel
        result_channels = []
        for c in range(3):
            convolved = convolve(img_array[:,:,c], kernel_matrix, mode='reflect')
            
            # For edge detection kernels, take absolute value and normalize
            if 'edge' in kernel_id or 'laplacian' in kernel_id or kernel_id == 'outline':
                convolved = np.abs(convolved)
                if convolved.max() > 0:
                    convolved = convolved / convolved.max() * 255
            
            # Interpolate with original based on strength
            if strength != 1.0:
                channel_result = img_array[:,:,c] * (1 - strength) + convolved * strength
            else:
                channel_result = convolved
            
            result_channels.append(np.clip(channel_result, 0, 255))
        
        result = np.stack(result_channels, axis=2).astype(np.uint8)
        original_display = img_array.astype(np.uint8)
    else:
        convolved = convolve(img_array, kernel_matrix, mode='reflect')
        
        # For edge detection kernels, take absolute value and normalize
        if 'edge' in kernel_id or 'laplacian' in kernel_id or kernel_id == 'outline':
            convolved = np.abs(convolved)
            if convolved.max() > 0:
                convolved = convolved / convolved.max() * 255
        
        # Interpolate with original based on strength
        if strength != 1.0:
            result = img_array * (1 - strength) + convolved * strength
        else:
            result = convolved
        
        result = np.clip(result, 0, 255).astype(np.uint8)
        original_display = normalize_for_display(img_array)
    
    return {
        "success": True,
        "image_id": image_id,
        "kernel_id": kernel_id,
        "kernel_name": kernel_data["name"],
        "kernel_matrix": kernel_matrix.tolist(),
        "kernel_size": kernel_size,
        "strength": strength,
        "is_color": is_color,
        "original": image_to_base64(original_display),
        "result": image_to_base64(result),
        "shape": list(img_array.shape)
    }


def gaussian_kernel_2d(size: int) -> np.ndarray:
    """Normalized separable Gaussian, sigma tied to the radius."""
    axis = np.linspace(-(size - 1) / 2., (size - 1) / 2., size)
    profile = np.exp(-0.5 * np.square(axis) / np.square(size / 3.0))
    weights = np.outer(profile, profile)
    return weights / weights.sum()


def delta_kernel_2d(size: int) -> np.ndarray:
    """All the weight on the centre tap: the do-nothing kernel."""
    delta = np.zeros((size, size))
    delta[size // 2, size // 2] = 1.0
    return delta


def resize_kernel(kernel: np.ndarray, new_size: int) -> np.ndarray:
    """Resize a 3x3 kernel to a larger radius while preserving what it does.

    Each family needs its own construction. Interpolating the 3x3 taps works only
    for directional kernels: applied to a sharpen it just smears the peak until
    the kernel stops sharpening (zero gain at Nyquist by 5x5).
    """
    if new_size == 3:
        return kernel

    total = kernel.sum()
    is_symmetric = np.allclose(kernel, kernel[::-1, ::-1])

    # Identity: stays a delta at any size.
    if np.count_nonzero(kernel) == 1 and np.allclose(kernel[1, 1], 1.0):
        return delta_kernel_2d(new_size)

    # Blur: averages, so it sums to one AND never subtracts. Sharpen and emboss
    # also sum to one, so the sum alone would misclassify them as blurs.
    if np.allclose(total, 1.0) and np.all(kernel >= 0):
        if np.allclose(kernel, kernel[0, 0]):
            return np.ones((new_size, new_size)) / (new_size * new_size)
        return gaussian_kernel_2d(new_size)

    # Edge detection: sums to zero. Keep the 3x3 pattern on the outer ring and
    # rebalance the centre so the larger kernel still sums to zero.
    if np.allclose(total, 0.0):
        scaled = np.zeros((new_size, new_size))
        for i in range(3):
            for j in range(3):
                scaled[int(i * (new_size - 1) / 2), int(j * (new_size - 1) / 2)] = kernel[i, j]
        centre = new_size // 2
        scaled[centre, centre] = -scaled.sum() + kernel[1, 1]
        return scaled

    # Symmetric enhancement (sharpen): unsharp masking at the larger radius,
    # which is what a sharpen of radius r means. amount comes from the original
    # centre tap, so 3x3 and 5x5 sharpen with the same strength.
    if np.allclose(total, 1.0) and is_symmetric:
        amount = float(kernel[1, 1]) - 1.0
        return (1.0 + amount) * delta_kernel_2d(new_size) - amount * gaussian_kernel_2d(new_size)

    # Directional kernels (emboss): interpolate, then restore the sum, since the
    # sum is what sets the output brightness.
    from scipy.ndimage import zoom
    resized = zoom(kernel, new_size / 3.0, order=1)[:new_size, :new_size]
    resized_total = resized.sum()
    if not np.isclose(total, 0.0) and not np.isclose(resized_total, 0.0):
        resized = resized * (total / resized_total)
    return resized


@app.get("/api/kernels/apply-custom/{image_id}")
async def apply_custom_kernel(
    image_id: str,
    k00: float = 0, k01: float = 0, k02: float = 0,
    k10: float = 0, k11: float = 1, k12: float = 0,
    k20: float = 0, k21: float = 0, k22: float = 0
):
    """Apply a custom 3x3 kernel to an image"""
    from scipy.ndimage import convolve
    
    # Load image
    img_path = TEST_IMAGES_DIR / f"{image_id}.png"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail=f"Image {image_id} not found")
    
    img = Image.open(img_path).convert('L')
    img_array = np.array(img, dtype=np.float64)
    
    # Build kernel from parameters
    kernel_matrix = np.array([
        [k00, k01, k02],
        [k10, k11, k12],
        [k20, k21, k22]
    ], dtype=np.float64)
    
    # Apply convolution
    result = convolve(img_array, kernel_matrix, mode='reflect')
    result = np.clip(result, 0, 255)
    
    return {
        "success": True,
        "image_id": image_id,
        "kernel_matrix": kernel_matrix.tolist(),
        "original": image_to_base64(normalize_for_display(img_array)),
        "result": image_to_base64(normalize_for_display(result)),
        "shape": list(img_array.shape)
    }


# Serve built frontend when running in Docker (static/ dir created by multi-stage build).
# Must be mounted LAST so all /api/* routes are matched first.
_static_dir = Path(__file__).parent / "static"
if _static_dir.exists():
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
