#!/usr/bin/env python3
"""
LPIPS Analyzer Sidecar
Provides Learned Perceptual Image Patch Similarity (LPIPS) computation
for image pair analysis in the Artist Registry feature.

Runs as a subprocess and communicates via JSON over stdin/stdout.
"""

import sys
import json
import numpy as np
from pathlib import Path

try:
    import torch
    import torchvision.transforms as transforms
    from PIL import Image
    
    # Try to use LPIPS if available
    try:
        import lpips
        LPIPS_AVAILABLE = True
    except ImportError:
        LPIPS_AVAILABLE = False
        print(json.dumps({
            "status": "warning",
            "message": "LPIPS library not found. Using fallback similarity metric."
        }), file=sys.stderr)
    
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    LPIPS_AVAILABLE = False


class LpipsAnalyzer:
    """Analyzer for computing LPIPS distances between images"""
    
    def __init__(self):
        """Initialize LPIPS model if available"""
        self.device = torch.device('cpu')  # Use CPU by default for compatibility
        self.model = None
        self.transform = transforms.Compose([
            transforms.Resize((299, 299)),  # Standard size for LPIPS
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.5, 0.5, 0.5], std=[0.5, 0.5, 0.5])
        ])
        
        if LPIPS_AVAILABLE and TORCH_AVAILABLE:
            try:
                self.model = lpips.LPIPS(net='alex', version='0.1')
                self.model.to(self.device)
                self.model.eval()
            except Exception as e:
                print(json.dumps({
                    "status": "warning",
                    "message": f"Failed to load LPIPS model: {str(e)}"
                }), file=sys.stderr)
                self.model = None
    
    def compute_distance(self, image_path_a: str, image_path_b: str) -> float:
        """
        Compute LPIPS distance between two images
        
        Args:
            image_path_a: Path to first image
            image_path_b: Path to second image
            
        Returns:
            LPIPS distance (0.0-1.0, where 0=identical, 1=completely different)
        """
        try:
            # Load images
            img_a = Image.open(image_path_a).convert('RGB')
            img_b = Image.open(image_path_b).convert('RGB')
            
            # If LPIPS is available, use it
            if self.model is not None:
                return self._compute_lpips(img_a, img_b)
            else:
                # Fallback: simple L2 distance in RGB space
                return self._compute_fallback(img_a, img_b)
                
        except Exception as e:
            return {
                "error": f"Error computing distance: {str(e)}"
            }
    
    def _compute_lpips(self, img_a: Image, img_b: Image) -> float:
        """Compute LPIPS distance using the model"""
        try:
            # Transform images
            tensor_a = self.transform(img_a).unsqueeze(0).to(self.device)
            tensor_b = self.transform(img_b).unsqueeze(0).to(self.device)
            
            # Compute distance
            with torch.no_grad():
                distance = self.model(tensor_a, tensor_b)
            
            # Return as float between 0-1
            distance_value = distance.item()
            # Normalize to 0-1 range (LPIPS typically returns 0-1)
            return float(np.clip(distance_value, 0, 1))
            
        except Exception as e:
            raise Exception(f"LPIPS computation failed: {str(e)}")
    
    def _compute_fallback(self, img_a: Image, img_b: Image) -> float:
        """
        Fallback similarity metric using simple L2 distance in RGB space
        Returns normalized distance in 0-1 range
        """
        try:
            # Resize to common size
            size = (256, 256)
            img_a = img_a.resize(size)
            img_b = img_b.resize(size)
            
            # Convert to numpy arrays
            arr_a = np.array(img_a, dtype=np.float32) / 255.0
            arr_b = np.array(img_b, dtype=np.float32) / 255.0
            
            # Compute L2 distance
            l2_distance = np.sqrt(np.mean((arr_a - arr_b) ** 2))
            
            # Normalize to typical LPIPS range (0-1)
            # L2 distance in [0, sqrt(3)] for normalized images,
            # so divide by sqrt(3) to get range [0, ~1]
            normalized_distance = l2_distance / np.sqrt(3)
            
            return float(np.clip(normalized_distance, 0, 1))
            
        except Exception as e:
            raise Exception(f"Fallback computation failed: {str(e)}")


def main():
    """Main loop for processing requests from Node.js"""
    
    if not TORCH_AVAILABLE:
        # Send error if torch not available
        error_response = {
            "status": "error",
            "message": "PyTorch not installed. Install with: pip install torch torchvision"
        }
        print(json.dumps(error_response), file=sys.stdout)
        return
    
    # Initialize analyzer
    try:
        analyzer = LpipsAnalyzer()
    except Exception as e:
        error_response = {
            "status": "error",
            "message": f"Failed to initialize analyzer: {str(e)}"
        }
        print(json.dumps(error_response), file=sys.stdout)
        return
    
    # Send ready signal
    ready_response = {
        "status": "ready",
        "lpips_available": LPIPS_AVAILABLE,
        "message": "LPIPS Analyzer ready"
    }
    print(json.dumps(ready_response), file=sys.stdout)
    sys.stdout.flush()
    
    # Main processing loop
    try:
        for line in sys.stdin:
            line = line.strip()
            if not line:
                continue
            
            try:
                request = json.loads(line)
            except json.JSONDecodeError:
                print(json.dumps({
                    "error": "Invalid JSON in request"
                }), file=sys.stdout)
                sys.stdout.flush()
                continue
            
            # Handle shutdown request
            if request.get('id') == 'shutdown':
                print(json.dumps({
                    "status": "shutdown",
                    "message": "Analyzer shutting down"
                }), file=sys.stdout)
                sys.stdout.flush()
                break
            
            # Process image pair request
            request_id = request.get('id', 'unknown')
            image_a = request.get('imageA')
            image_b = request.get('imageB')
            
            if not image_a or not image_b:
                print(json.dumps({
                    "id": request_id,
                    "error": "Missing imageA or imageB paths"
                }), file=sys.stdout)
                sys.stdout.flush()
                continue
            
            # Verify files exist
            if not Path(image_a).exists():
                print(json.dumps({
                    "id": request_id,
                    "error": f"Image A not found: {image_a}"
                }), file=sys.stdout)
                sys.stdout.flush()
                continue
            
            if not Path(image_b).exists():
                print(json.dumps({
                    "id": request_id,
                    "error": f"Image B not found: {image_b}"
                }), file=sys.stdout)
                sys.stdout.flush()
                continue
            
            # Compute distance
            try:
                distance = analyzer.compute_distance(image_a, image_b)
                
                if isinstance(distance, dict) and "error" in distance:
                    # Error in computation
                    print(json.dumps({
                        "id": request_id,
                        "error": distance["error"]
                    }), file=sys.stdout)
                else:
                    # Success
                    print(json.dumps({
                        "id": request_id,
                        "distance": distance
                    }), file=sys.stdout)
                    
            except Exception as e:
                print(json.dumps({
                    "id": request_id,
                    "error": f"Computation error: {str(e)}"
                }), file=sys.stdout)
            
            sys.stdout.flush()
    
    except KeyboardInterrupt:
        # Graceful shutdown on Ctrl+C
        print(json.dumps({
            "status": "interrupted",
            "message": "Analyzer interrupted"
        }), file=sys.stdout)
        sys.stdout.flush()
    
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": f"Unexpected error: {str(e)}"
        }), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
