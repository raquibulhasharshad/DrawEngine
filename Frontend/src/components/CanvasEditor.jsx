import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Square, 
  Circle as CircleIcon, 
  MousePointer2, 
  Save, 
  ChevronLeft,
  Trash2,
  Undo2,
  Redo2,
  Download,
  Palette,
  Layers,
  Settings,
  Pencil,
  Type,
  Eraser,
  Minus,
  Check,
  Pencil as PencilIcon,
  Bold,
  Underline,
  Plus,
  PaintBucket
} from 'lucide-react';
import api from '../api/api';

const hexToRgba = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16), a: 255 } : {r:0,g:0,b:0,a:255};
};

const floodFillMask = (imgData, maskData, startX, startY, fillColor) => {
  const w = imgData.width;
  const h = imgData.height;
  const pixels = imgData.data;
  const mask = maskData.data;
  const startIdx = (startY * w + startX) * 4;
  const sr = pixels[startIdx], sg = pixels[startIdx+1], sb = pixels[startIdx+2], sa = pixels[startIdx+3];
  if (sr === fillColor.r && sg === fillColor.g && sb === fillColor.b && sa === fillColor.a) return false;

  const stack = new Int32Array(w * h);
  let head = 0;
  stack[head++] = startY * w + startX;
  const visited = new Uint8Array(w * h);
  visited[startY * w + startX] = 1;
  const tolerance = 60;
  const matchesTarget = (idx) => {
    const r = pixels[idx], g = pixels[idx+1], b = pixels[idx+2], a = pixels[idx+3];
    if (sa === 0 && a === 0) return true;
    return Math.abs(r-sr) < tolerance && Math.abs(g-sg) < tolerance && Math.abs(b-sb) < tolerance && Math.abs(a-sa) < tolerance;
  };

  let filled = false;
  while (head > 0) {
    const pos = stack[--head];
    const x = pos % w; const y = Math.floor(pos / w);
    const idx = (y * w + x) * 4;
    mask[idx] = fillColor.r; mask[idx+1] = fillColor.g; mask[idx+2] = fillColor.b; mask[idx+3] = fillColor.a;
    filled = true;
    if (x > 0) { const n = pos - 1; if (!visited[n] && matchesTarget(n*4)) { visited[n] = 1; stack[head++] = n; } }
    if (x < w - 1) { const n = pos + 1; if (!visited[n] && matchesTarget(n*4)) { visited[n] = 1; stack[head++] = n; } }
    if (y > 0) { const n = pos - w; if (!visited[n] && matchesTarget(n*4)) { visited[n] = 1; stack[head++] = n; } }
    if (y < h - 1) { const n = pos + w; if (!visited[n] && matchesTarget(n*4)) { visited[n] = 1; stack[head++] = n; } }
  }

  if (filled) {
    const dilated = new Uint8ClampedArray(maskData.data.buffer.slice(0));
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const idx = (y * w + x) * 4;
        if (mask[idx+3] !== 0) continue;
        if (dilated[idx - 4 + 3] !== 0 || dilated[idx + 4 + 3] !== 0 || dilated[idx - w*4 + 3] !== 0 || dilated[idx + w*4 + 3] !== 0) {
          mask[idx] = fillColor.r; mask[idx+1] = fillColor.g; mask[idx+2] = fillColor.b; mask[idx+3] = fillColor.a;
        }
      }
    }
  }

  return filled;
};

const CanvasEditor = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const textInputRef = useRef(null);

  // State
  const [designName, setDesignName] = useState('Loading...');
  const [objects, setObjects] = useState([]);
  const [tool, setTool] = useState('rect'); // rect, circle, select
  const [color, setColor] = useState('#3b82f6');
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentObject, setCurrentObject] = useState(null);
  const [lineWidth, setLineWidth] = useState(4);
  const [history, setHistory] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [saving, setSaving] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // { type, message, onConfirm }
  const [typingObject, setTypingObject] = useState(null); // { x, y }
  const [selectedId, setSelectedId] = useState(null);
  const [resizeHandle, setResizeHandle] = useState(null); // 'nw', 'ne', 'sw', 'se', 'start', 'end'
  const [isResizing, setIsResizing] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [snapPoint, setSnapPoint] = useState(null);
  
  const [eraserSize, setEraserSize] = useState(16);
  const [showEraserMenu, setShowEraserMenu] = useState(false);
  const offscreenCanvasRef = useRef(document.createElement('canvas'));
  const targetEraserIdRef = useRef(null);

  // References for drawing state (immediate access)
  const isDrawingRef = useRef(false);
  const startPosRef = useRef({ x: 0, y: 0 });

  const getSnappedCoords = useCallback((rawX, rawY) => {
    let closest = null; let minD = 15;
    objects.forEach(obj => {
      let pts = [];
      if (obj.type === 'rect') pts.push({x: obj.x, y: obj.y}, {x: obj.x+obj.width, y: obj.y}, {x: obj.x, y: obj.y+obj.height}, {x: obj.x+obj.width, y: obj.y+obj.height});
      if (obj.type === 'line') pts.push({x: obj.startX, y: obj.startY}, {x: obj.endX, y: obj.endY});
      if (obj.type === 'path' && obj.points?.length > 0) pts.push(obj.points[0], obj.points[obj.points.length-1]);
      pts.forEach(p => { const d = Math.hypot(p.x - rawX, p.y - rawY); if (d < minD) { minD = d; closest = p; } });
    });
    if (closest) setSnapPoint(closest);
    else setSnapPoint(null);
    return closest ? closest : { x: rawX, y: rawY };
  }, [objects]);

  const checkHit = useCallback((obj, x, y) => {
    if (obj.type === 'rect') {
      const onLeft = Math.abs(x - obj.x) < 10 && y >= obj.y - 10 && y <= obj.y + obj.height + 10;
      const onRight = Math.abs(x - (obj.x + obj.width)) < 10 && y >= obj.y - 10 && y <= obj.y + obj.height + 10;
      const onTop = Math.abs(y - obj.y) < 10 && x >= obj.x - 10 && x <= obj.x + obj.width + 10;
      const onBottom = Math.abs(y - (obj.y + obj.height)) < 10 && x >= obj.x - 10 && x <= obj.x + obj.width + 10;
      return onLeft || onRight || onTop || onBottom;
    } else if (obj.type === 'circle') {
      return Math.abs(Math.hypot(x - obj.centerX, y - obj.centerY) - obj.radius) < 10;
    } else if (obj.type === 'text') {
      const w = obj.content.length * (obj.fontSize / 1.5) + 20;
      const h = obj.fontSize + 20;
      return x >= obj.x - 10 && x <= obj.x + w && y >= obj.y - h && y <= obj.y + 10;
    } else if (obj.type === 'line') {
      const l2 = (obj.startX - obj.endX)**2 + (obj.startY - obj.endY)**2;
      if (l2 === 0) return false;
      let t = ((x - obj.startX) * (obj.endX - obj.startX) + (y - obj.startY) * (obj.endY - obj.startY)) / l2;
      t = Math.max(0, Math.min(1, t));
      return Math.hypot(x - (obj.startX + t * (obj.endX - obj.startX)), y - (obj.startY + t * (obj.endY - obj.startY))) < 10;
    } else if (obj.type === 'path' && obj.points) {
      for (let i = 0; i < obj.points.length - 1; i++) {
        const p1 = obj.points[i], p2 = obj.points[i+1];
        const l2 = (p1.x - p2.x)**2 + (p1.y - p2.y)**2;
        if (l2 === 0) continue;
        let t = ((x - p1.x) * (p2.x - p1.x) + (y - p1.y) * (p2.y - p1.y)) / l2;
        t = Math.max(0, Math.min(1, t));
        if (Math.hypot(x - (p1.x + t * (p2.x - p1.x)), y - (p1.y + t * (p2.y - p1.y))) < 15) return true;
      }
      return false;
    }
  }, []);

  const addToHistory = useCallback((newObjects) => {
    setHistory(prev => [...prev.slice(-19), objects]); // Keep last 20 states
    setObjects(newObjects);
    setRedoStack([]);
  }, [objects]);

  const undo = useCallback(() => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setRedoStack(prev => [...prev, objects]);
    setHistory(prev => prev.slice(0, -1));
    setObjects(previous);
  }, [history, objects]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setHistory(prev => [...prev, objects]);
    setRedoStack(prev => prev.slice(0, -1));
    setObjects(next);
  }, [redoStack, objects]);

  const drawObjectCore = (ctx, obj, isPreview = false) => {
    ctx.strokeStyle = obj.color;
    ctx.fillStyle = obj.color;
    ctx.lineWidth = obj.thickness || 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = isPreview ? 0.5 : 1.0;
    
    if (obj.type === 'rect') {
      ctx.strokeRect(obj.x, obj.y, obj.width, obj.height);
    } else if (obj.type === 'circle') {
      ctx.beginPath();
      ctx.arc(obj.centerX, obj.centerY, obj.radius, 0, Math.PI * 2);
      ctx.stroke();
    } else if (obj.type === 'line') {
      ctx.beginPath();
      ctx.moveTo(obj.startX, obj.startY);
      ctx.lineTo(obj.endX, obj.endY);
      ctx.stroke();
    } else if (obj.type === 'raster_fill') {
      if (!obj.img) {
         const img = new Image();
         img.src = obj.dataUrl;
         obj.img = img;
      }
      if (obj.img.complete) {
         ctx.drawImage(obj.img, obj.x, obj.y);
      } else {
         const oldOnload = obj.img.onload;
         obj.img.onload = () => { if (oldOnload) oldOnload(); render(); };
      }
    } else if (obj.type === 'path') {
      if (!obj.points || obj.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(obj.points[0].x, obj.points[0].y);
      obj.points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.stroke();
    } else if (obj.type === 'text') {
      const weight = obj.isBold !== false ? 'bold ' : 'normal ';
      ctx.font = `${weight}${obj.fontSize || 24}px 'Plus Jakarta Sans'`;
      ctx.fillText(obj.content, obj.x, obj.y);
      if (obj.isUnderline && obj.content) {
        const metrics = ctx.measureText(obj.content);
        const textWidth = metrics.width;
        ctx.beginPath();
        const offset = Math.max(3, (obj.fontSize || 24) * 0.1);
        ctx.moveTo(obj.x, obj.y + offset);
        ctx.lineTo(obj.x + textWidth, obj.y + offset);
        ctx.lineWidth = Math.max(2, (obj.fontSize || 24) * 0.08);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1.0;
  };

  const drawObject = (ctx, obj, isPreview = false) => {
    if (!obj.erasers || obj.erasers.length === 0) {
      drawObjectCore(ctx, obj, isPreview);
      return;
    }

    const off = offscreenCanvasRef.current;
    if (off.width !== canvasRef.current.width || off.height !== canvasRef.current.height) {
      off.width = canvasRef.current.width;
      off.height = canvasRef.current.height;
    }
    const offCtx = off.getContext('2d');
    offCtx.clearRect(0, 0, off.width, off.height);
    
    drawObjectCore(offCtx, obj, isPreview);
    
    offCtx.globalCompositeOperation = 'destination-out';
    offCtx.fillStyle = 'black';
    obj.erasers.forEach(eraserPath => {
       if (!eraserPath.points || eraserPath.points.length === 0) return;
       const size = eraserPath.size || 16;
       offCtx.beginPath();
       eraserPath.points.forEach(p => {
          offCtx.rect(p.x - size/2, p.y - size/2, size, size);
       });
       offCtx.fill();
    });
    offCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(off, 0, 0);
  };

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid (Optional but nice)
    ctx.strokeStyle = '#f8fafc'; // Very light slate for white background
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }

    // Draw stored objects
    objects.forEach(obj => {
      drawObject(ctx, obj);
      // Logic for selection highlight
      if (selectedId === obj.id) {
        drawBoundingBox(ctx, obj);
      }
    });

    // Draw preview object
    if (currentObject) {
      drawObject(ctx, currentObject, true);
    }

    // Draw snap point indicator
    if (snapPoint && (tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'pencil')) {
      ctx.beginPath();
      ctx.arc(snapPoint.x, snapPoint.y, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#06b6d4';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }, [objects, currentObject, selectedId, snapPoint, tool]);

  const drawBoundingBox = (ctx, obj) => {
    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
    let x, y, w, h;
    if (obj.type === 'rect') {
      x = obj.x; y = obj.y; w = obj.width; h = obj.height;
    } else if (obj.type === 'circle') {
      x = obj.centerX - obj.radius; y = obj.centerY - obj.radius; 
      w = obj.radius * 2; h = obj.radius * 2;
    } else if (obj.type === 'line') {
      x = Math.min(obj.startX, obj.endX); y = Math.min(obj.startY, obj.endY);
      w = Math.abs(obj.startX - obj.endX); h = Math.abs(obj.startY - obj.endY);
      ctx.strokeRect(x - 5, y - 5, w + 10, h + 10);
      ctx.setLineDash([]);
      ctx.fillStyle = '#fff';
      ctx.fillRect(obj.startX - 5, obj.startY - 5, 10, 10);
      ctx.fillRect(obj.endX - 5, obj.endY - 5, 10, 10);
      return;
    } else if (obj.type === 'text') {
      const w_text = obj.content.length * (obj.fontSize / 1.5) + 10;
      const h_text = obj.fontSize + 10;
      x = obj.x - 5; y = obj.y - h_text + 5; w = w_text; h = h_text;
    } else {
      return;
    }

    ctx.strokeRect(x - 5, y - 5, w + 10, h + 10);
    ctx.setLineDash([]);
    
    // Draw corners
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - 8, y - 8, 6, 6);
    ctx.fillRect(x + w + 2, y - 8, 6, 6);
    ctx.fillRect(x - 8, y + h + 2, 6, 6);
    ctx.fillRect(x + w + 2, y + h + 2, 6, 6);
  };

  // Load design
  useEffect(() => {
    const fetchDesign = async () => {
      try {
        const response = await api.get('/designs'); // In a real app, GET /designs/:id
        const design = response.data.find(d => d.id === parseInt(id));
        if (design) {
          setDesignName(design.name);
          setObjects(design.data.objects || []);
        } else {
          navigate('/');
        }
      } catch (error) {
        console.error('Failed to load design', error);
        navigate('/');
      }
    };
    fetchDesign();
  }, [id, navigate]);

  // Adjust canvas size
  useEffect(() => {
    const resizeCanvas = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        render(); // Re-render content after resize
      }
    };
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();
    return () => window.removeEventListener('resize', resizeCanvas);
  }, [render]); // Depends on render which depends on objects

  useEffect(() => {
    const handleKeyDown = (e) => {
      // Shortcuts only if not in an input
      if (document.activeElement.tagName === 'INPUT') return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'z') {
          e.preventDefault();
          undo();
        } else if (e.key.toLowerCase() === 'y') {
          e.preventDefault();
          redo();
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'p': setTool('pencil'); break;
        case 'l': setTool('line'); break;
        case 'r': setTool('rect'); break;
        case 'c': setTool('circle'); break;
        case 't': setTool('text'); break;
        case 'e': setTool('eraser'); break;
        case 'f': setTool('fill'); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, objects]); // Re-bind when history functions change

  useEffect(() => {
    if (typingObject && textInputRef.current) {
      textInputRef.current.focus();
    }
  }, [typingObject]);

  useEffect(() => {
    render();
  }, [render]);
  const commitText = useCallback(() => {
    if (typingObject && typingObject.content.trim()) {
      const newObj = { 
        type: 'text', 
        x: typingObject.x, 
        y: typingObject.y + ((typingObject.fontSize || lineWidth * 6) / 1.5), // Match baseline
        content: typingObject.content, 
        color: typingObject.color || color, 
        fontSize: typingObject.fontSize || lineWidth * 6,
        isBold: typingObject.isBold !== false,
        isUnderline: typingObject.isUnderline === true,
        id: typingObject.id || Date.now()
      };
      
      const exists = objects.find(o => o.id === newObj.id);
      if (exists) {
        addToHistory(objects.map(o => o.id === newObj.id ? newObj : o));
      } else {
        addToHistory([...objects, newObj]);
      }
    }
    setTypingObject(null);
  }, [typingObject, objects, lineWidth, color, addToHistory]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    addToHistory(objects.filter(obj => obj.id !== selectedId));
    setSelectedId(null);
  }, [selectedId, objects, addToHistory]);

  const startEditingText = useCallback((obj) => {
    setTypingObject({
      id: obj.id,
      x: obj.x,
      y: obj.y - obj.fontSize, // Open at top left
      content: obj.content,
      color: obj.color,
      fontSize: obj.fontSize,
      isBold: obj.isBold !== false,
      isUnderline: obj.isUnderline === true
    });
    setSelectedId(null); // Deselect during edit
  }, []);

  const startDrawing = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    let rawX = e.clientX - rect.left;
    let rawY = e.clientY - rect.top;
    if (tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'pencil') {
      const snapped = getSnappedCoords(rawX, rawY);
      rawX = snapped.x; rawY = snapped.y;
    } else setSnapPoint(null);
    const x = rawX; const y = rawY;

    if (tool === 'select') {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // 1. Check if clicking a handle of the selected object
      if (selectedId) {
        const obj = objects.find(o => o.id === selectedId);
        if (obj) {
          const handleSize = 10;
          if (obj.type === 'rect') {
            if (x >= obj.x - handleSize && x <= obj.x && y >= obj.y - handleSize && y <= obj.y) { setResizeHandle('nw'); setIsResizing(true); return; }
            if (x >= obj.x + obj.width && x <= obj.x + obj.width + handleSize && y >= obj.y - handleSize && y <= obj.y) { setResizeHandle('ne'); setIsResizing(true); return; }
            if (x >= obj.x - handleSize && x <= obj.x && y >= obj.y + obj.height && y <= obj.y + obj.height + handleSize) { setResizeHandle('sw'); setIsResizing(true); return; }
            if (x >= obj.x + obj.width && x <= obj.x + obj.width + handleSize && y >= obj.y + obj.height && y <= obj.y + obj.height + handleSize) { setResizeHandle('se'); setIsResizing(true); return; }
          } else if (obj.type === 'circle') {
            const ox = obj.centerX - obj.radius; const oy = obj.centerY - obj.radius; const ow = obj.radius * 2;
            if (x >= ox - handleSize && x <= ox && y >= oy - handleSize && y <= oy) { setResizeHandle('nw'); setIsResizing(true); return; }
            if (x >= ox + ow && x <= ox + ow + handleSize && y >= oy - handleSize && y <= oy) { setResizeHandle('ne'); setIsResizing(true); return; }
            if (x >= ox - handleSize && x <= ox && y >= oy + ow && y <= oy + ow + handleSize) { setResizeHandle('sw'); setIsResizing(true); return; }
            if (x >= ox + ow && x <= ox + ow + handleSize && y >= oy + ow && y <= oy + ow + handleSize) { setResizeHandle('se'); setIsResizing(true); return; }
          } else if (obj.type === 'line') {
            const distStart = Math.sqrt(Math.pow(x - obj.startX, 2) + Math.pow(y - obj.startY, 2));
            const distEnd = Math.sqrt(Math.pow(x - obj.endX, 2) + Math.pow(y - obj.endY, 2));
            if (distStart < 15) { setResizeHandle('start'); setIsResizing(true); return; }
            if (distEnd < 15) { setResizeHandle('end'); setIsResizing(true); return; }
          }
        }
      }

      // 2. Otherwise, check for new selection or moving (Z-order reverse)
      const hit = [...objects].reverse().find(obj => checkHit(obj, x, y));

      if (hit) {
        setSelectedId(hit.id);
        setIsMoving(true);
        if (hit.type === 'rect' || hit.type === 'text') setDragOffset({ x: x - hit.x, y: y - hit.y });
        else if (hit.type === 'circle') setDragOffset({ x: x - hit.centerX, y: y - hit.centerY });
        else if (hit.type === 'line') setDragOffset({ x: x - hit.startX, y: y - hit.startY });
      } else {
        setSelectedId(null);
      }
      return;
    }

    if (tool === 'eraser') {
      setIsDrawing(true);
      isDrawingRef.current = true;
      const hit = [...objects].reverse().find(obj => checkHit(obj, x, y));
      if (hit) {
        targetEraserIdRef.current = hit.id;
        const existingErasers = hit.erasers || [];
        const newObjects = objects.map(o => o.id === hit.id ? {
          ...o,
          erasers: [...existingErasers, { size: eraserSize, points: [{x,y}] }]
        } : o);
        setObjects(newObjects);
      } else {
        targetEraserIdRef.current = null;
      }
      return;
    }

    if (tool === 'fill') {
      const offscreen = document.createElement('canvas');
      offscreen.width = canvasRef.current.width;
      offscreen.height = canvasRef.current.height;
      const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
      objects.forEach(o => drawObject(offCtx, o));
      
      const imgData = offCtx.getImageData(0, 0, offscreen.width, offscreen.height);
      const maskData = new ImageData(offscreen.width, offscreen.height);
      const fillRgba = hexToRgba(color);
      
      const filled = floodFillMask(imgData, maskData, Math.round(x), Math.round(y), fillRgba);
      
      if (filled) {
        offCtx.clearRect(0, 0, offscreen.width, offscreen.height);
        offCtx.putImageData(maskData, 0, 0);
        const dataUrl = offscreen.toDataURL();
        addToHistory([...objects, { type: 'raster_fill', dataUrl, x: 0, y: 0, id: Date.now() }]);
      }
      return;
    }

    if (tool === 'text') {
      setTypingObject({ 
        x, 
        y, 
        content: '',
        isBold: true,
        isUnderline: false
      });
      return;
    }

    isDrawingRef.current = true;
    startPosRef.current = { x, y };
    setIsDrawing(true);

    if (tool === 'rect') {
      setCurrentObject({ type: 'rect', x, y, width: 0, height: 0, color, thickness: lineWidth });
    } else if (tool === 'circle') {
      setCurrentObject({ type: 'circle', centerX: x, centerY: y, radius: 0, color, thickness: lineWidth });
    } else if (tool === 'pencil') {
      setCurrentObject({ type: 'path', points: [{ x, y }], color, thickness: lineWidth });
    } else if (tool === 'eraser') {
      setCurrentObject({ type: 'eraser', points: [{ x, y }], color: 'rgba(0,0,0,1)', thickness: lineWidth * 4 });
    } else if (tool === 'line') {
      setCurrentObject({ type: 'line', startX: x, startY: y, endX: x, endY: y, color, thickness: lineWidth });
    }
  };

  const draw = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    let rawX = e.clientX - rect.left;
    let rawY = e.clientY - rect.top;

    if (isDrawingRef.current && (tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'pencil')) {
      const snapped = getSnappedCoords(rawX, rawY);
      rawX = snapped.x; rawY = snapped.y;
    } else if (!isDrawingRef.current && (tool === 'line' || tool === 'rect' || tool === 'circle' || tool === 'pencil')) {
      getSnappedCoords(rawX, rawY); // Just for visual feedback when hovering
    } else {
      setSnapPoint(null);
    }
    const x = rawX; const y = rawY;

    if (isMoving && selectedId) {
      const newObjects = objects.map(obj => {
        if (obj.id !== selectedId) return obj;
        if (obj.type === 'rect' || obj.type === 'text') return { ...obj, x: x - dragOffset.x, y: y - dragOffset.y };
        if (obj.type === 'circle') return { ...obj, centerX: x - dragOffset.x, centerY: y - dragOffset.y };
        if (obj.type === 'line') {
          const dx = obj.endX - obj.startX;
          const dy = obj.endY - obj.startY;
          const newStartX = x - dragOffset.x;
          const newStartY = y - dragOffset.y;
          return { ...obj, startX: newStartX, startY: newStartY, endX: newStartX + dx, endY: newStartY + dy };
        }
        return obj;
      });
      setObjects(newObjects);
      return;
    }

    if (isResizing && selectedId) {
      const newObjects = objects.map(obj => {
        if (obj.id !== selectedId) return obj;
        
        if (obj.type === 'rect') {
          let { x: ox, y: oy, width: ow, height: oh } = obj;
          if (resizeHandle === 'nw') { ow += ox - x; oh += oy - y; ox = x; oy = y; }
          if (resizeHandle === 'ne') { ow = x - ox; oh += oy - y; oy = y; }
          if (resizeHandle === 'sw') { ow += ox - x; oh = y - oy; ox = x; }
          if (resizeHandle === 'se') { ow = x - ox; oh = y - oy; }
          return { ...obj, x: ox, y: oy, width: Math.max(5, ow), height: Math.max(5, oh) };
        } else if (obj.type === 'circle') {
          const dx = x - obj.centerX;
          const dy = y - obj.centerY;
          const radius = Math.sqrt(dx * dx + dy * dy);
          return { ...obj, radius: Math.max(5, radius) };
        } else if (obj.type === 'line') {
          if (resizeHandle === 'start') return { ...obj, startX: x, startY: y };
          if (resizeHandle === 'end') return { ...obj, endX: x, endY: y };
        }
        return obj;
      });
      setObjects(newObjects);
      return;
    }

    if (isDrawingRef.current && tool === 'eraser') {
      if (targetEraserIdRef.current) {
        const newObjects = objects.map(o => {
          if (o.id === targetEraserIdRef.current) {
             const updatedErasers = [...(o.erasers || [])];
             if (updatedErasers.length === 0) return o;
             const lastPath = { ...updatedErasers[updatedErasers.length-1] };
             lastPath.points = [...lastPath.points, {x, y}];
             updatedErasers[updatedErasers.length-1] = lastPath;
             return { ...o, erasers: updatedErasers };
          }
          return o;
        });
        setObjects(newObjects);
      }
      return;
    }

    if (!isDrawingRef.current || !currentObject) return;

    if (tool === 'rect') {
      setCurrentObject({
        ...currentObject,
        x: Math.min(x, startPosRef.current.x),
        y: Math.min(y, startPosRef.current.y),
        width: Math.abs(x - startPosRef.current.x),
        height: Math.abs(y - startPosRef.current.y),
      });
    } else if (tool === 'circle') {
      const radius = Math.sqrt(
        Math.pow(x - startPosRef.current.x, 2) + 
        Math.pow(y - startPosRef.current.y, 2)
      );
      setCurrentObject({
        ...currentObject,
        radius,
      });
    } else if (tool === 'pencil') {
      setCurrentObject({
        ...currentObject,
        points: [...currentObject.points, { x, y }]
      });
    } else if (tool === 'line') {
      setCurrentObject({
        ...currentObject,
        endX: x,
        endY: y
      });
    }
  };

  const stopDrawing = () => {
    if (isResizing || isMoving) {
      setRedoStack([]);
      setHistory(prev => [...prev.slice(-19), objects]); 
      setIsResizing(false);
      setIsMoving(false);
      setResizeHandle(null);
      return;
    }

    if (tool === 'eraser') {
      isDrawingRef.current = false;
      setIsDrawing(false);
      if (history.length === 0 || objects !== history[history.length - 1]) {
        addToHistory(objects);
      }
      return;
    }

    if (isDrawingRef.current && currentObject) {
      addToHistory([...objects, { ...currentObject, id: Date.now() }]);
    }
    isDrawingRef.current = false;
    setIsDrawing(false);
    setCurrentObject(null);
  };

  const downloadImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Create a temporary canvas with the background color for export
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const ctx = exportCanvas.getContext('2d');
    
    // Fill background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    
    // Draw all objects
    objects.forEach(obj => drawObject(ctx, obj));
    
    const link = document.createElement('a');
    link.download = `design-${id}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleanObjects = objects.map(o => {
        const { img, ...rest } = o;
        return rest;
      });
      await api.post('/designs', {
        id: parseInt(id),
        name: designName,
        data: { objects: cleanObjects }
      });
      setActiveModal({
        type: 'info',
        message: 'Project state synchronized with Visual Registry.'
      });
    } catch (error) {
      setActiveModal({
        type: 'info',
        message: 'Failed to synchronize project state.'
      });
    } finally {
      setSaving(false);
    }
  };

  const clearCanvas = () => {
    setActiveModal({
      type: 'confirm',
      message: 'This will purge all active clusters from the workspace. Proceed?',
      onConfirm: () => setObjects([])
    });
  };

  return (
    <div className="h-screen flex flex-col bg-[#020617] text-slate-200 overflow-hidden relative">
      {/* Background Decor */}
      <div className="bg-glow"></div>
      <div className="blob top-[-20%] left-[-10%] opacity-10"></div>
      <div className="blob bottom-[-20%] right-[-10%] opacity-10" style={{ animationDelay: '4s' }}></div>

      {/* Editor Header */}
      <header className="glass-plus h-20 border-b border-white/5 flex items-center justify-between px-8 shrink-0 relative z-30 mx-6 mt-6 rounded-[24px]">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => navigate('/')}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all group"
          >
            <ChevronLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
          </button>
          
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-[0.3em] text-primary-400 font-bold mb-1">Project Name</span>
            <input 
              type="text"
              className="bg-transparent border-none font-black text-2xl outline-none focus:text-white transition-all w-64 tracking-tighter"
              value={designName}
              onChange={(e) => setDesignName(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-white/5 rounded-2xl p-1.5 mr-4">
            <button 
              onClick={undo}
              disabled={history.length === 0}
              className="p-2.5 hover:bg-white/10 disabled:opacity-30 rounded-xl transition-all"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-5 h-5" />
            </button>
            <button 
              onClick={redo}
              disabled={redoStack.length === 0}
              className="p-2.5 hover:bg-white/10 disabled:opacity-30 rounded-xl transition-all"
              title="Redo (Ctrl+Y)"
            >
              <Redo2 className="w-5 h-5" />
            </button>
          </div>

          <button 
            onClick={downloadImage}
            className="p-3.5 bg-white/5 hover:bg-white/10 rounded-2xl transition-all group"
            title="Download PNG"
          >
            <Download className="w-5 h-5" />
          </button>

          <button 
            onClick={clearCanvas}
            className="flex items-center gap-2 px-5 py-3 hover:bg-red-500/10 text-red-500 rounded-2xl transition-all font-bold text-sm"
          >
            <Trash2 className="w-5 h-5" />
            <span className="hidden md:inline">Clear</span>
          </button>
          
          <div className="h-8 w-[1px] bg-white/10 mx-2"></div>
          
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-3 bg-gradient-to-r from-primary-600 to-primary-500 hover:from-primary-500 hover:to-primary-400 text-white px-8 py-3.5 rounded-2xl font-black transition-all shadow-2xl shadow-primary-600/30 active:scale-95 disabled:opacity-50"
          >
            <Save className={`w-5 h-5 ${saving ? 'animate-spin' : ''}`} />
            <span>{saving ? 'Saving...' : 'Save Design'}</span>
          </button>
        </div>
      </header>

      <div className="flex-1 flex flex-row overflow-hidden p-6 gap-6 relative z-20">
        {/* Left Toolbar */}
        <aside className="w-24 glass-plus flex flex-col items-center py-8 gap-4 shrink-0 rounded-[32px] overflow-y-auto max-h-[calc(100vh-160px)] scrollbar-hide z-50">
          {[

            { id: 'select', icon: MousePointer2, label: 'Identify (S)' },
            { id: 'pencil', icon: Pencil, label: 'Pencil (P)' },
            { id: 'line', icon: Minus, label: 'Line (L)' },
            { id: 'rect', icon: Square, label: 'Rectangle (R)' },
            { id: 'circle', icon: CircleIcon, label: 'Circle (C)' },
            { id: 'text', icon: Type, label: 'Text (T)' },
            { id: 'eraser', icon: Eraser, label: 'Eraser (E)' },
            { id: 'fill', icon: PaintBucket, label: 'Fill (F)' },
          ].map(item => (
            <button
              key={item.id}
              title={item.label}
              onClick={() => {
                if (item.id === 'eraser') {
                  if (tool === 'eraser') setShowEraserMenu(!showEraserMenu);
                  else { setTool('eraser'); setShowEraserMenu(true); }
                } else {
                  setTool(item.id);
                  setShowEraserMenu(false);
                }
              }}
              className={`p-4 rounded-[20px] transition-all group relative ${
                tool === item.id 
                ? 'bg-primary-500 text-white shadow-2xl shadow-primary-500/40 scale-110' 
                : 'hover:bg-white/5 text-slate-500 hover:text-white'
              }`}
            >
              <item.icon className="w-6 h-6" />
            </button>
          ))}
          
          <div className="w-12 h-[1px] bg-white/10 my-4"></div>
          
          {/* Thickness Controller */}
          <div className="flex flex-col items-center gap-3">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Size</span>
            {[2, 4, 8, 12].map(size => (
              <button 
                key={size}
                onClick={() => {
                  setLineWidth(size);
                  if (selectedId) {
                    setObjects(objects.map(obj => 
                      obj.id === selectedId 
                        ? { ...obj, thickness: size, ...(obj.type === 'text' ? { fontSize: size * 6 } : {}) } 
                        : obj
                    ));
                    setRedoStack([]);
                    setHistory(prev => [...prev.slice(-19), objects]);
                  }
                }}
                className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-all ${
                  lineWidth === size ? 'border-primary-500 bg-primary-500/10' : 'border-white/5 hover:border-white/20'
                }`}
              >
                <div style={{ width: size, height: size }} className="bg-white rounded-full"></div>
              </button>
            ))}
          </div>

          <div className="w-12 h-[1px] bg-white/10 my-4"></div>
          
          <div className="flex flex-col items-center gap-3 w-full px-2">
            <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Color</span>
            <div className="grid grid-cols-2 gap-2">
              {['#000000', '#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'].map(c => (
                <button 
                  key={c}
                  className="w-7 h-7 rounded-full border-2 transition-all hover:scale-125"
                  style={{ 
                    backgroundColor: c,
                    borderColor: color === c ? 'rgba(255,255,255,0.8)' : 'transparent',
                    boxShadow: color === c ? `0 0 10px ${c}` : 'none'
                  }}
                  onClick={() => {
                    setColor(c);
                    if (selectedId) {
                      setObjects(objects.map(obj => 
                        obj.id === selectedId ? { ...obj, color: c } : obj
                      ));
                      setRedoStack([]);
                      setHistory(prev => [...prev.slice(-19), objects]);
                    }
                  }}
                />
              ))}
              <div 
                className="relative w-7 h-7 rounded-full border-2 overflow-hidden transition-all hover:scale-125 cursor-pointer"
                title="Custom Color"
                style={{
                  background: !['#000000', '#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'].includes(color) ? color : 'conic-gradient(red, yellow, lime, aqua, blue, magenta, red)',
                  borderColor: !['#000000', '#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'].includes(color) ? 'rgba(255,255,255,0.8)' : 'transparent',
                  boxShadow: !['#000000', '#ffffff', '#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#ec4899'].includes(color) ? `0 0 10px ${color}` : 'none'
                }}
              >
                <input 
                  type="color" 
                  value={color} 
                  onChange={(e) => {
                    const c = e.target.value;
                    setColor(c);
                    if (selectedId) {
                      setObjects(objects.map(obj => obj.id === selectedId ? { ...obj, color: c } : obj));
                    }
                  }} 
                  className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer border-0 p-0 opacity-0"
                />
              </div>
            </div>
          </div>
        </aside>

        {/* Global Floating Submenus */}
        {showEraserMenu && (
           <div className="absolute left-[8.5rem] top-1/2 -translate-y-1/2 bg-slate-800 p-2 rounded-2xl flex flex-col gap-2 border border-white/10 z-[100] shadow-2xl">
              {[4, 8, 16, 24].map(s => (
                 <div key={s} 
                      onClick={(e) => { e.stopPropagation(); setEraserSize(s); setShowEraserMenu(false); }}
                      className={`w-12 h-12 hover:bg-white/10 rounded-xl flex items-center justify-center cursor-pointer ${eraserSize === s ? 'bg-primary-500/20 border border-primary-500' : ''}`}>
                    <div style={{ width: s, height: s, backgroundColor: 'white' }}></div>
                 </div>
              ))}
           </div>
        )}

        {/* Canvas Area */}
        <main 
          ref={containerRef}
          className="flex-1 relative rounded-[40px] overflow-hidden border border-white/5 shadow-2xl bg-white"
        >
          <canvas
            ref={canvasRef}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
            onDoubleClick={(e) => {
              if (tool !== 'select' || !selectedId) return;
              const obj = objects.find(o => o.id === selectedId);
              if (obj && obj.type === 'text') startEditingText(obj);
            }}
            className="block w-full h-full"
            style={{
              cursor: tool === 'eraser' 
                ? `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='${eraserSize}' height='${eraserSize}'><rect x='1' y='1' width='${eraserSize-2 > 0 ? eraserSize-2 : 2}' height='${eraserSize-2 > 0 ? eraserSize-2 : 2}' fill='white' stroke='black' stroke-width='1'/></svg>") ${eraserSize/2} ${eraserSize/2}, crosshair`
                : tool === 'text' ? 'text'
                : tool === 'fill' ? 'cell'
                : tool === 'select' 
                  ? (isResizing ? 'grabbing' : isMoving ? 'move' : 'default') 
                  : 'crosshair'
            }}
          />

          {/* Selection HUD */}
          {selectedId && !isResizing && !isMoving && (() => {
            const obj = objects.find(o => o.id === selectedId);
            if (!obj) return null;
            
            // Calculate hover position
            let hX, hY;
            if (obj.type === 'rect') { hX = obj.x + obj.width / 2; hY = obj.y - 60; }
            else if (obj.type === 'circle') { hX = obj.centerX; hY = obj.centerY - obj.radius - 60; }
            else if (obj.type === 'text') { hX = obj.x + 40; hY = obj.y - obj.fontSize - 60; }
            else if (obj.type === 'line') { hX = (obj.startX + obj.endX) / 2; hY = Math.min(obj.startY, obj.endY) - 60; }
            else return null;

            return (
              <div 
                className="absolute z-[110] flex gap-2 p-2 glass-plus rounded-2xl border border-white/10 shadow-2xl animate-in fade-in zoom-in slide-in-from-bottom-2 duration-200"
                style={{ left: hX, top: hY, transform: 'translateX(-50%)' }}
              >
                {obj.type === 'text' && (
                  <>
                    <div className="flex items-center gap-1 bg-white/5 rounded-lg px-1 mr-1 border border-white/5">
                      <button 
                        onClick={() => {
                          setObjects(objects.map(o => o.id === obj.id ? { ...o, fontSize: Math.max(12, (o.fontSize || 24) - 4) } : o));
                          setRedoStack([]); setHistory(prev => [...prev.slice(-19), objects]);
                        }}
                        className="p-1.5 text-slate-400 hover:text-white transition-all"
                        title="Decrease Size"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-[10px] font-bold text-slate-300 min-w-[20px] text-center">
                        {Math.round(obj.fontSize || 24)}
                      </span>
                      <button 
                        onClick={() => {
                          setObjects(objects.map(o => o.id === obj.id ? { ...o, fontSize: Math.min(120, (o.fontSize || 24) + 4) } : o));
                          setRedoStack([]); setHistory(prev => [...prev.slice(-19), objects]);
                        }}
                        className="p-1.5 text-slate-400 hover:text-white transition-all"
                        title="Increase Size"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <button 
                      onClick={() => {
                        setObjects(objects.map(o => o.id === obj.id ? { ...o, isBold: o.isBold === false ? true : false } : o));
                        setRedoStack([]); setHistory(prev => [...prev.slice(-19), objects]);
                      }}
                      className={`p-2 rounded-lg transition-all ${obj.isBold !== false ? 'bg-primary-500/20 text-primary-400' : 'text-slate-400 hover:text-white'}`}
                      title="Bold"
                    >
                      <Bold className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => {
                        setObjects(objects.map(o => o.id === obj.id ? { ...o, isUnderline: !o.isUnderline } : o));
                        setRedoStack([]); setHistory(prev => [...prev.slice(-19), objects]);
                      }}
                      className={`p-2 rounded-lg transition-all ${obj.isUnderline ? 'bg-primary-500/20 text-primary-400' : 'text-slate-400 hover:text-white'}`}
                      title="Underline"
                    >
                      <Underline className="w-4 h-4" />
                    </button>
                    <div className="w-[1px] h-6 bg-white/10 self-center mx-1"></div>
                    <button 
                      onClick={() => startEditingText(obj)}
                      className="p-2 hover:bg-primary-500/20 text-primary-400 rounded-lg transition-all"
                      title="Edit Text"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button 
                  onClick={deleteSelected}
                  className="p-2 hover:bg-red-500/20 text-red-500 rounded-lg transition-all"
                  title="Delete Object"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })()}

          {/* Inline Text Editor (MS Paint Style) */}
          {typingObject && (
            <div 
              className="absolute z-[100] p-4 glass-plus rounded-[24px] pointer-events-auto border-2 border-primary-500/50"
              style={{ left: typingObject.x - 20, top: typingObject.y - 20 }}
            >
              <div className="flex flex-col gap-3">
                <textarea
                  ref={textInputRef}
                  value={typingObject.content}
                  onChange={(e) => setTypingObject({ ...typingObject, content: e.target.value })}
                  placeholder="Type message..."
                  className="bg-transparent text-white outline-none resize overflow-hidden min-w-[150px] placeholder:text-slate-600"
                  style={{ 
                    fontFamily: "'Plus Jakarta Sans'", 
                    fontSize: `${typingObject.fontSize || lineWidth * 6}px`,
                    fontWeight: typingObject.isBold !== false ? 'bold' : 'normal',
                    textDecoration: typingObject.isUnderline ? 'underline' : 'none',
                    color: typingObject.color || color
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      commitText();
                    }
                    if (e.key === 'Escape') setTypingObject(null);
                  }}
                />
                <div className="flex justify-between items-center pt-2 border-t border-white/10 mt-2">
                  <div className="flex gap-2 items-center">
                    <div className="flex gap-1">
                      <button 
                        onClick={() => setTypingObject({ ...typingObject, isBold: typingObject.isBold === false ? true : false })}
                        className={`p-1.5 rounded-lg transition-all ${typingObject.isBold !== false ? 'bg-primary-500/20 text-primary-400' : 'text-slate-400 hover:text-white'}`}
                      >
                        <Bold className="w-3 h-3" />
                      </button>
                      <button 
                        onClick={() => setTypingObject({ ...typingObject, isUnderline: !typingObject.isUnderline })}
                        className={`p-1.5 rounded-lg transition-all ${typingObject.isUnderline ? 'bg-primary-500/20 text-primary-400' : 'text-slate-400 hover:text-white'}`}
                      >
                        <Underline className="w-3 h-3" />
                      </button>
                    </div>
                    
                    <div className="w-[1px] h-4 bg-white/10"></div>
                    
                    <div className="flex items-center gap-1 bg-white/5 rounded-lg px-1 border border-white/5">
                      <button 
                        onClick={() => setTypingObject({ ...typingObject, fontSize: Math.max(12, (typingObject.fontSize || lineWidth * 6) - 4) })}
                        className="p-1 text-slate-400 hover:text-white transition-all"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="text-[10px] font-bold text-slate-300 min-w-[20px] text-center">
                        {Math.round(typingObject.fontSize || lineWidth * 6)}
                      </span>
                      <button 
                        onClick={() => setTypingObject({ ...typingObject, fontSize: Math.min(120, (typingObject.fontSize || lineWidth * 6) + 4) })}
                        className="p-1 text-slate-400 hover:text-white transition-all"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <button 
                    onClick={commitText}
                    className="p-2 bg-primary-500 text-slate-950 rounded-xl hover:bg-primary-400 transition-all font-black flex items-center gap-2 text-xs"
                  >
                    <Check className="w-4 h-4" />
                    <span>DONE</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Canvas HUD */}
          <div className="absolute bottom-10 left-10 flex items-center gap-6 pointer-events-none">
            <div className="glass-plus px-6 py-3 rounded-2xl border border-white/10 flex items-center gap-4">
              <div className="w-3 h-3 rounded-full animate-pulse bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]"></div>
              <span className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Engine Active</span>
            </div>
            <div className="glass-plus px-6 py-3 rounded-2xl border border-white/10">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                <span className="text-white">{objects.length}</span> Clusters Rendered
              </span>
            </div>
          </div>
        </main>
      </div>
      {/* Custom Studio Modals */}
      {activeModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-6">
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl" onClick={() => setActiveModal(null)}></div>
          <div className="relative w-full max-w-md glass-plus rounded-[32px] p-10 border border-primary-500/20 shadow-2xl animate-slide-up">
            <h3 className="text-2xl font-black text-white mb-4 tracking-tighter">
              {activeModal.type === 'confirm' ? 'Confirm Action' : 'Notification'}
            </h3>
            <p className="text-slate-400 mb-8 font-medium">{activeModal.message}</p>
            <div className="flex gap-4">
              {activeModal.type === 'confirm' && (
                <button 
                  onClick={() => setActiveModal(null)}
                  className="flex-1 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl transition-all"
                >
                  Cancel
                </button>
              )}
              <button 
                onClick={() => {
                  if (activeModal.onConfirm) activeModal.onConfirm();
                  setActiveModal(null);
                }}
                className="flex-1 py-4 bg-primary-500 hover:bg-primary-400 text-slate-950 font-black rounded-2xl transition-all shadow-xl shadow-primary-500/20"
              >
                {activeModal.type === 'confirm' ? 'Confirm' : 'Got it'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CanvasEditor;
