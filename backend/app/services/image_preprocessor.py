import cv2
import numpy as np
from PIL import Image
import io

class ImagePreprocessor:
    @staticmethod
    def bytes_to_cv2(image_bytes: bytes) -> np.ndarray:
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("No se pudo decodificar la imagen.")
        return img

    @staticmethod
    def cv2_to_bytes(img: np.ndarray, format: str = ".png") -> bytes:
        success, encoded = cv2.imencode(format, img)
        if not success:
            raise ValueError("Error al codificar imagen.")
        return encoded.tobytes()

    @staticmethod
    def deskew(img: np.ndarray) -> tuple[np.ndarray, float]:
        """Calcula el ángulo de inclinación y rota la imagen para dejarla derecha."""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img.copy()
        
        # Binarización invertida para encontrar componentes de texto
        thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
        
        coords = np.column_stack(np.where(thresh > 0))
        if len(coords) < 50:
            return img, 0.0
            
        angle = cv2.minAreaRect(coords)[-1]
        
        # Ajustar ángulo según la convención de OpenCV
        if angle < -45:
            angle = -(90 + angle)
        elif angle > 45:
            angle = 90 - angle
        else:
            angle = -angle
            
        # Si el ángulo es ínfimo, no rotar
        if abs(angle) < 0.2:
            return img, 0.0
            
        (h, w) = img.shape[:2]
        center = (w // 2, h // 2)
        M = cv2.getRotationMatrix2D(center, angle, 1.0)
        rotated = cv2.warpAffine(
            img, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
        )
        return rotated, float(angle)

    @staticmethod
    def enhance_contrast(img: np.ndarray) -> np.ndarray:
        """Aplica CLAHE (Contrast Limited Adaptive Histogram Equalization) para mejorar legibilidad."""
        if len(img.shape) == 3:
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            cl = clahe.apply(l)
            merged = cv2.merge((cl, a, b))
            return cv2.cvtColor(merged, cv2.COLOR_LAB2BGR)
        else:
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            return clahe.apply(img)

    @staticmethod
    def remove_shadows_and_phone_fixes(img: np.ndarray) -> np.ndarray:
        """Corrige fotos de teléfonos: sombras irregulares, iluminación no homogénea."""
        if len(img.shape) == 3:
            rgb_planes = cv2.split(img)
            result_norm_planes = []
            for plane in rgb_planes:
                dilated_img = cv2.dilate(plane, np.ones((7, 7), np.uint8))
                bg_img = cv2.medianBlur(dilated_img, 21)
                diff_img = 255 - cv2.absdiff(plane, bg_img)
                norm_img = cv2.normalize(
                    diff_img, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX, dtype=cv2.CV_8UC1
                )
                result_norm_planes.append(norm_img)
            return cv2.merge(result_norm_planes)
        else:
            dilated = cv2.dilate(img, np.ones((7, 7), np.uint8))
            bg = cv2.medianBlur(dilated, 21)
            diff = 255 - cv2.absdiff(img, bg)
            return cv2.normalize(diff, None, alpha=0, beta=255, norm_type=cv2.NORM_MINMAX, dtype=cv2.CV_8UC1)

    @staticmethod
    def denoise(img: np.ndarray) -> np.ndarray:
        """Elimina ruido de escaneo conservando bordes nítidos."""
        if len(img.shape) == 3:
            return cv2.fastNlMeansDenoisingColored(img, None, 10, 10, 7, 21)
        return cv2.fastNlMeansDenoising(img, None, 10, 7, 21)

    @staticmethod
    def binarize(img: np.ndarray) -> np.ndarray:
        """Binarización adaptativa de alta definición."""
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img
        return cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, 8
        )

    @classmethod
    def process_pipeline(
        cls,
        image_bytes: bytes,
        deskew: bool = True,
        enhance_contrast: bool = True,
        phone_photo_mode: bool = False,
        denoise: bool = False,
        binarize: bool = False,
    ) -> tuple[bytes, dict]:
        """Aplica la secuencia de mejoras seleccionadas."""
        img = cls.bytes_to_cv2(image_bytes)
        info = {"deskew_angle": 0.0, "steps_applied": []}

        if phone_photo_mode:
            img = cls.remove_shadows_and_phone_fixes(img)
            info["steps_applied"].append("shadow_removal")

        if deskew:
            img, angle = cls.deskew(img)
            info["deskew_angle"] = angle
            if abs(angle) >= 0.2:
                info["steps_applied"].append(f"deskew_{angle:.2f}deg")

        if enhance_contrast and not binarize:
            img = cls.enhance_contrast(img)
            info["steps_applied"].append("clahe_contrast")

        if denoise:
            img = cls.denoise(img)
            info["steps_applied"].append("denoise")

        if binarize:
            img = cls.binarize(img)
            info["steps_applied"].append("binarization")

        result_bytes = cls.cv2_to_bytes(img, ".png")
        return result_bytes, info
