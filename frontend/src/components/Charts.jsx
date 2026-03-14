import { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import './Charts.css';

function Charts({ data, orders, positions = [], visibleBars = 50, timeframe = '1h', reversalSignals = [] }) {
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const candlestickSeriesRef = useRef(null);
  const [chartInfo, setChartInfo] = useState(null);
  const [activeTool, setActiveTool] = useState(null);
  const [horizontalLines, setHorizontalLines] = useState([]);
  const orderLinesRef = useRef([]);  // 訂單價格線的引用
  const lastDataStartTimeRef = useRef(null); // 追蹤資料起始時間，判斷是否新載入
  const [showLineEditor, setShowLineEditor] = useState(false);
  const [editingLine, setEditingLine] = useState(null);
  const [lineForm, setLineForm] = useState({
    price: '',
    color: '#2196F3',
    lineStyle: 0,
    label: '',
  });
  const activeToolRef = useRef(null);
  const [movingLine, setMovingLine] = useState(null); // 正在移動的線
  const movingLineRef = useRef(null);

  const horizontalLinesRef = useRef([]);

  // 水平線拖曳
  const [hLinePixels, setHLinePixels] = useState([]); // [{ id, y, color }]
  const hLinePixelsRef = useRef([]);
  const hLineDragIdRef = useRef(null);     // 正在拖曳的線 id
  const hLineDragPriceRef = useRef(null);  // 拖曳中的即時價格（不 setState，避免 re-render）

  // 矩形相關狀態
  const [rectangles, setRectangles] = useState([]);
  const [drawingRect, setDrawingRect] = useState(null); // 正在繪製的矩形 {startPrice, startTime, startX, startY}
  const [rectColor, setRectColor] = useState('rgba(33, 150, 243, 0.2)'); // 矩形顏色
  const rectanglesRef = useRef([]);
  const [rectPixels, setRectPixels] = useState([]); // 矩形的像素坐標
  const rectPixelsRef = useRef([]); // 供事件監聽器讀取最新像素坐標
  const [previewRect, setPreviewRect] = useState(null); // 拖曳時的預覽矩形
  const [showRectEditor, setShowRectEditor] = useState(false); // 矩形編輯器
  const [editingRect, setEditingRect] = useState(null); // 正在編輯的矩形
  const [rectForm, setRectForm] = useState({
    topPrice: '',
    bottomPrice: '',
    color: 'rgba(33, 150, 243, 0.2)',
    extend: false,
  });
  const [editingRectId, setEditingRectId] = useState(null); // 正在編輯的矩形ID
  const [dragMode, setDragMode] = useState(null); // 'move' | 'resize-tl' | 'resize-tr' | 'resize-bl' | 'resize-br' | null
  const [dragStart, setDragStart] = useState(null); // 拖曳起始點 {x, y, rect}
  const dragModeRef = useRef(null);
  const dragStartRef = useRef(null);
  const editingRectIdRef = useRef(null);

  // 價格標注
  const [priceLabels, setPriceLabels] = useState([]);
  const priceLabelsRef = useRef([]);
  const [priceLabelPixels, setPriceLabelPixels] = useState([]);
  const [labelColor, setLabelColor] = useState('#f59e0b');
  const labelColorRef = useRef('#f59e0b');
  const dataRef = useRef([]);

  // 趨勢線相關狀態
  const [trendLines, setTrendLines] = useState([]);
  const trendLinesRef = useRef([]);
  const [trendLinePixels, setTrendLinePixels] = useState([]);
  const trendLinePixelsRef = useRef([]);
  const [drawingTrendLine, setDrawingTrendLine] = useState(null); // { logical, price } 第一個點
  const drawingTrendLineRef = useRef(null);
  const [previewTrendLine, setPreviewTrendLine] = useState(null); // { x1,y1,x2,y2 } 預覽線像素
  const [trendLineColor, setTrendLineColor] = useState('#ef4444');
  const trendLineColorRef = useRef('#ef4444');

  // 同步 horizontalLines 到 ref（供右鍵事件使用）
  useEffect(() => {
    horizontalLinesRef.current = horizontalLines;
  }, [horizontalLines]);

  const LINE_COLORS = [
    { value: '#2196F3', name: '藍色' },
    { value: '#4CAF50', name: '綠色' },
    { value: '#f44336', name: '紅色' },
    { value: '#ff9800', name: '橙色' },
    { value: '#9c27b0', name: '紫色' },
    { value: '#000000', name: '黑色' },
  ];

  const RECT_COLORS = [
    { value: 'rgba(33, 150, 243, 0.2)', name: '藍色' },
    { value: 'rgba(76, 175, 80, 0.2)', name: '綠色' },
    { value: 'rgba(244, 67, 54, 0.2)', name: '紅色' },
    { value: 'rgba(255, 152, 0, 0.2)', name: '橙色' },
    { value: 'rgba(156, 39, 176, 0.2)', name: '紫色' },
  ];

  // 同步 activeTool 到 ref
  useEffect(() => {
    activeToolRef.current = activeTool;
  }, [activeTool]);

  // 同步 movingLine 到 ref
  useEffect(() => {
    movingLineRef.current = movingLine;
  }, [movingLine]);

  // 同步 rectangles 到 ref
  useEffect(() => {
    rectanglesRef.current = rectangles;
  }, [rectangles]);

  // 同步 rectPixels 到 ref（供事件監聽器使用）
  useEffect(() => {
    rectPixelsRef.current = rectPixels;
  }, [rectPixels]);

  // 同步編輯狀態到 ref
  useEffect(() => {
    editingRectIdRef.current = editingRectId;
  }, [editingRectId]);

  // 進入/離開矩形編輯模式時，停用/恢復圖表橫向 panning
  // 必須在 editingRectId 改變時就設定，不能等到拖曳開始才設定
  // 原因：lightweight-charts 在 pointerdown 時就會 setPointerCapture，
  // 等到 drag 開始才 applyOptions 已經太晚，pan 已經被 chart 搶走了
  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.applyOptions({
      handleScroll: editingRectId
        ? { pressedMouseMove: false, horzTouchDrag: false, mouseWheel: true, vertTouchDrag: true }
        : { pressedMouseMove: true, horzTouchDrag: true, mouseWheel: true, vertTouchDrag: true },
    });
  }, [editingRectId]);

  useEffect(() => {
    dragModeRef.current = dragMode;
  }, [dragMode]);

  useEffect(() => {
    dragStartRef.current = dragStart;
  }, [dragStart]);

  useEffect(() => {
    priceLabelsRef.current = priceLabels;
  }, [priceLabels]);

  useEffect(() => {
    labelColorRef.current = labelColor;
  }, [labelColor]);

  useEffect(() => {
    dataRef.current = data || [];
  }, [data]);

  useEffect(() => {
    trendLinesRef.current = trendLines;
  }, [trendLines]);

  useEffect(() => {
    trendLinePixelsRef.current = trendLinePixels;
  }, [trendLinePixels]);

  useEffect(() => {
    drawingTrendLineRef.current = drawingTrendLine;
  }, [drawingTrendLine]);

  useEffect(() => {
    trendLineColorRef.current = trendLineColor;
  }, [trendLineColor]);

  // 切換工具時取消趨勢線繪製
  useEffect(() => {
    if (activeTool !== 'trendline') {
      setDrawingTrendLine(null);
      drawingTrendLineRef.current = null;
      setPreviewTrendLine(null);
    }
  }, [activeTool]);

  // 打開水平線編輯器
  const openLineEditor = (price = null, existingLine = null) => {
    if (existingLine) {
      setEditingLine(existingLine);
      setLineForm({
        price: existingLine.price.toString(),
        color: existingLine.color,
        lineStyle: existingLine.lineStyle,
        label: existingLine.label || '',
      });
    } else {
      setEditingLine(null);
      setLineForm({
        price: price ? price.toFixed(2) : '',
        color: '#2196F3',
        lineStyle: 0,
        label: '',
      });
    }
    setShowLineEditor(true);
    setActiveTool(null);
    activeToolRef.current = null;
  };

  // 更新趨勢線像素位置
  const updateTrendLinePixels = () => {
    if (!chartRef.current || !candlestickSeriesRef.current) return;
    const timeScale = chartRef.current.timeScale();
    const pixels = trendLinesRef.current.map(line => {
      const x1 = timeScale.logicalToCoordinate(line.logical1);
      const y1 = candlestickSeriesRef.current.priceToCoordinate(line.price1);
      const x2 = timeScale.logicalToCoordinate(line.logical2);
      const y2 = candlestickSeriesRef.current.priceToCoordinate(line.price2);
      if (x1 === null || y1 === null || x2 === null || y2 === null) return null;
      return { id: line.id, x1, y1, x2, y2, color: line.color };
    }).filter(Boolean);
    setTrendLinePixels(pixels);
    trendLinePixelsRef.current = pixels;
  };

  // 更新水平線像素 Y 座標（供拖曳用）
  const updateHLinePixels = () => {
    if (!candlestickSeriesRef.current) return;
    const pixels = horizontalLinesRef.current.map(line => ({
      id: line.id,
      y: candlestickSeriesRef.current.priceToCoordinate(line.price),
      color: line.color,
    })).filter(p => p.y !== null);
    setHLinePixels(pixels);
    hLinePixelsRef.current = pixels;
  };

  // 更新價格標注像素位置
  const updateLabelPixels = () => {
    if (!candlestickSeriesRef.current || !chartRef.current) return;
    const timeScale = chartRef.current.timeScale();
    const pixels = priceLabelsRef.current.map(label => ({
      id: label.id,
      x: timeScale.timeToCoordinate(label.time),
      y: candlestickSeriesRef.current.priceToCoordinate(label.price),
      isHigh: label.isHigh,
    }));
    setPriceLabelPixels(pixels);
  };

  // 保存水平線
  const saveLine = () => {
    if (!candlestickSeriesRef.current || !lineForm.price) return;

    const price = parseFloat(lineForm.price);
    if (isNaN(price)) return;

    // 如果是編輯現有線，先刪除舊的
    if (editingLine) {
      deleteLine(editingLine.id);
    }

    const priceLine = candlestickSeriesRef.current.createPriceLine({
      price: price,
      color: lineForm.color,
      lineWidth: 2,
      lineStyle: lineForm.lineStyle,
      axisLabelVisible: true,
      title: lineForm.label,
    });

    const newLine = {
      id: Date.now(),
      price: price,
      color: lineForm.color,
      lineStyle: lineForm.lineStyle,
      label: lineForm.label,
      priceLineRef: priceLine,
    };

    setHorizontalLines(prev => [...prev, newLine]);
    setShowLineEditor(false);
    setEditingLine(null);
  };

  // 刪除單條線
  const deleteLine = (lineId) => {
    setHorizontalLines(prev => {
      const line = prev.find(l => l.id === lineId);
      if (line && line.priceLineRef) {
        try {
          candlestickSeriesRef.current.removePriceLine(line.priceLineRef);
        } catch (e) {}
      }
      return prev.filter(l => l.id !== lineId);
    });
    setShowLineEditor(false);
    setEditingLine(null);
  };

  // 處理圖表點擊
  const handleChartClick = (param) => {
    if (!param.point) return;

    const price = candlestickSeriesRef.current.coordinateToPrice(param.point.y);
    if (price === null) return;

    // 如果正在移動線，將線移動到新位置
    if (movingLineRef.current) {
      moveLineToPrice(movingLineRef.current, price);
      setMovingLine(null);
      return;
    }

    // 新增價格標注 — 自動 snap 到最近 K 棒的高點或低點
    if (activeToolRef.current === 'label') {
      const logical = chartRef.current?.timeScale().coordinateToLogical(param.point.x);
      const idx = logical !== null ? Math.round(logical) : -1;
      const candles = dataRef.current;
      const candle = candles[Math.max(0, Math.min(idx, candles.length - 1))];
      if (!candle) return;

      const highY = candlestickSeriesRef.current.priceToCoordinate(candle.high);
      const lowY = candlestickSeriesRef.current.priceToCoordinate(candle.low);
      const mouseY = param.point.y;
      const snapToHigh = Math.abs(mouseY - highY) <= Math.abs(mouseY - lowY);
      const snapPrice = snapToHigh ? candle.high : candle.low;

      const newLabel = {
        id: Date.now(),
        price: parseFloat(snapPrice.toFixed(2)),
        time: candle.time,
        isHigh: snapToHigh,
        color: labelColorRef.current,
      };
      setPriceLabels(prev => [...prev, newLabel]);
      return;
    }

    // 趨勢線：第一次點擊設第一點，第二次點擊完成線
    if (activeToolRef.current === 'trendline') {
      const logical = chartRef.current?.timeScale().coordinateToLogical(param.point.x);
      const idx = logical !== null ? Math.round(logical) : -1;
      const candles = dataRef.current;
      const candle = candles[Math.max(0, Math.min(idx, candles.length - 1))];
      if (!candle) return;

      const highY = candlestickSeriesRef.current.priceToCoordinate(candle.high);
      const lowY = candlestickSeriesRef.current.priceToCoordinate(candle.low);
      const mouseY = param.point.y;
      const snapToHigh = Math.abs(mouseY - highY) <= Math.abs(mouseY - lowY);
      const snapPrice = snapToHigh ? candle.high : candle.low;
      const snapLogical = logical ?? idx;

      if (!drawingTrendLineRef.current) {
        const firstPoint = { logical: snapLogical, price: snapPrice };
        setDrawingTrendLine(firstPoint);
        drawingTrendLineRef.current = firstPoint;
      } else {
        const newLine = {
          id: Date.now(),
          logical1: drawingTrendLineRef.current.logical,
          price1: drawingTrendLineRef.current.price,
          logical2: snapLogical,
          price2: snapPrice,
          color: trendLineColorRef.current,
        };
        setTrendLines(prev => [...prev, newLine]);
        setDrawingTrendLine(null);
        drawingTrendLineRef.current = null;
        setPreviewTrendLine(null);
      }
      return;
    }

    // 如果正在編輯矩形，點擊其他地方退出編輯模式
    if (editingRectId && !dragMode) {
      setEditingRectId(null);
    }

    // 新增水平線（snap 到最近 K 棒的高/低點）
    if (activeToolRef.current === 'hline') {
      const logical = chartRef.current?.timeScale().coordinateToLogical(param.point.x);
      const idx = logical !== null ? Math.round(logical) : -1;
      const candles = dataRef.current;
      const candle = candles[Math.max(0, Math.min(idx, candles.length - 1))];
      if (candle) {
        const highY = candlestickSeriesRef.current.priceToCoordinate(candle.high);
        const lowY = candlestickSeriesRef.current.priceToCoordinate(candle.low);
        const snapToHigh = Math.abs(param.point.y - highY) <= Math.abs(param.point.y - lowY);
        openLineEditor(snapToHigh ? candle.high : candle.low);
      } else {
        openLineEditor(price);
      }
    }
    // 矩形改用拖曳方式繪製，不在這裡處理
  };

  // 獲取像素坐標對應的價格和時間（支援未來區域）
  const getCoordinatesFromPixel = (x, y) => {
    if (!chartRef.current || !candlestickSeriesRef.current) return null;

    const price = candlestickSeriesRef.current.coordinateToPrice(y);
    const timeScale = chartRef.current.timeScale();

    // 嘗試獲取時間
    let time = timeScale.coordinateToTime(x);

    // 如果時間為 null（未來區域），用邏輯索引估算時間
    if (time === null && data && data.length > 0) {
      const visibleRange = timeScale.getVisibleLogicalRange();
      if (visibleRange) {
        const chartWidth = chartContainerRef.current?.clientWidth || 800;
        // 計算 x 座標對應的邏輯索引
        const logicalIndex = visibleRange.from + (x / chartWidth) * (visibleRange.to - visibleRange.from);

        // 估算時間（假設每根K棒間隔固定）
        const lastCandle = data[data.length - 1];
        const timeInterval = data.length > 1 ? data[data.length - 1].time - data[data.length - 2].time : 300;

        // 從最後一根K棒計算時間
        const barsFromLast = logicalIndex - (data.length - 1);
        time = Math.round(lastCandle.time + barsFromLast * timeInterval);
      }
    }

    // 如果還是無法獲取，給一個預設值
    if (time === null && data && data.length > 0) {
      time = data[data.length - 1].time;
    }

    return { price, time };
  };

  // 矩形編輯：開始拖曳
  const handleEditDragStart = (e, mode) => {
    e.stopPropagation();
    e.preventDefault();
    if (!editingRectId) return;

    const rect = rectanglesRef.current.find(r => r.id === editingRectId);
    if (!rect) return;

    const visibleRange = chartRef.current?.timeScale().getVisibleLogicalRange();
    const startData = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      rect: { ...rect },
      visibleRange,
    };

    // 直接更新 ref（不等 useEffect），確保第一個 mousemove 就能讀到正確值
    dragStartRef.current = startData;
    dragModeRef.current = mode;
    editingRectIdRef.current = editingRectId;

    // 用 setDragMode 觸發 re-render → 顯示全螢幕 overlay（取代 document 事件監聽）
    setDragMode(mode);
    setDragStart(startData);
  };

  // 矩形編輯：拖曳中（document 級別，用像素差值計算價格和時間變化）
  const handleEditDragMoveDoc = (e) => {
    if (!chartRef.current || !candlestickSeriesRef.current) return;

    // 使用 ref 獲取最新的值
    const currentDragStart = dragStartRef.current;
    const currentDragMode = dragModeRef.current;
    const currentEditingRectId = editingRectIdRef.current;

    if (!currentDragMode || !currentDragStart || !currentEditingRectId) return;

    // 鎖定 viewport：強制恢復拖曳開始時的視角，防止圖表 panning 干擾
    const timeScale = chartRef.current.timeScale();
    if (currentDragStart.visibleRange) {
      timeScale.setVisibleLogicalRange(currentDragStart.visibleRange);
    }

    const deltaX = e.clientX - currentDragStart.mouseX;
    const deltaY = e.clientY - currentDragStart.mouseY;

    // 計算價格變化（Y軸：上移價格增加）
    const priceScale = candlestickSeriesRef.current;
    const currentPrice = priceScale.coordinateToPrice(100);
    const newPrice = priceScale.coordinateToPrice(100 + deltaY);
    if (currentPrice === null || newPrice === null) return;
    const deltaPrice = newPrice - currentPrice;

    // 計算時間變化（X軸，用拖曳開始時的 visibleRange 保持穩定）
    const visibleRange = currentDragStart.visibleRange;
    if (!visibleRange) return;
    const chartWidth = chartContainerRef.current?.clientWidth || 800;
    const pixelsPerBar = chartWidth / (visibleRange.to - visibleRange.from);

    const original = currentDragStart.rect;
    const deltaLogical = deltaX / pixelsPerBar;

    setRectangles(prev => prev.map(r => {
      if (r.id !== currentEditingRectId) return r;

      if (currentDragMode === 'move') {
        return {
          ...r,
          startPrice: original.startPrice + deltaPrice,
          endPrice: original.endPrice + deltaPrice,
          startLogical: (original.startLogical ?? 0) + deltaLogical,
          endLogical: (original.endLogical ?? 0) + deltaLogical,
        };
      } else if (currentDragMode === 'resize-tl') {
        return {
          ...r,
          startPrice: original.startPrice + deltaPrice,
          startLogical: (original.startLogical ?? 0) + deltaLogical,
        };
      } else if (currentDragMode === 'resize-tr') {
        return {
          ...r,
          startPrice: original.startPrice + deltaPrice,
          endLogical: (original.endLogical ?? 0) + deltaLogical,
        };
      } else if (currentDragMode === 'resize-bl') {
        return {
          ...r,
          endPrice: original.endPrice + deltaPrice,
          startLogical: (original.startLogical ?? 0) + deltaLogical,
        };
      } else if (currentDragMode === 'resize-br') {
        return {
          ...r,
          endPrice: original.endPrice + deltaPrice,
          endLogical: (original.endLogical ?? 0) + deltaLogical,
        };
      }
      return r;
    }));
  };

  // 矩形編輯：結束拖曳
  const handleEditDragEndDoc = () => {
    dragStartRef.current = null;
    dragModeRef.current = null;
    setDragMode(null);
    setDragStart(null);
  };

  // 矩形拖曳開始（繪製新矩形）
  const handleMouseDown = (e) => {
    if (activeToolRef.current !== 'rect') return;
    if (!chartContainerRef.current) return;

    const containerRect = chartContainerRef.current.getBoundingClientRect();
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;

    const coords = getCoordinatesFromPixel(x, y);
    if (!coords || coords.price === null || coords.time === null) return;

    const startLogical = chartRef.current.timeScale().coordinateToLogical(x);

    setDrawingRect({
      startPrice: coords.price,
      startTime: coords.time,
      startLogical: startLogical ?? 0,
      startX: x,
      startY: y,
    });
  };

  // 矩形拖曳中
  const handleMouseMove = (e) => {
    if (!drawingRect || activeToolRef.current !== 'rect') {
      setPreviewRect(null);
      return;
    }
    if (!chartContainerRef.current) return;

    const containerRect = chartContainerRef.current.getBoundingClientRect();
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;

    setPreviewRect({
      x: Math.min(drawingRect.startX, x),
      y: Math.min(drawingRect.startY, y),
      width: Math.abs(x - drawingRect.startX),
      height: Math.abs(y - drawingRect.startY),
      color: rectColor,
    });
  };

  // 矩形拖曳結束（繪製新矩形）
  const handleMouseUp = (e) => {
    if (!drawingRect || activeToolRef.current !== 'rect') return;
    if (!chartContainerRef.current) return;

    const containerRect = chartContainerRef.current.getBoundingClientRect();
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;

    const coords = getCoordinatesFromPixel(x, y);
    if (!coords || coords.price === null || coords.time === null) {
      setDrawingRect(null);
      setPreviewRect(null);
      return;
    }

    // 確保矩形有一定大小
    const priceDiff = Math.abs(drawingRect.startPrice - coords.price);
    if (priceDiff < 1) {
      setDrawingRect(null);
      setPreviewRect(null);
      return;
    }

    const endLogical = chartRef.current.timeScale().coordinateToLogical(x) ?? drawingRect.startLogical;
    const logicalLeft = Math.min(drawingRect.startLogical, endLogical);
    const logicalRight = Math.max(drawingRect.startLogical, endLogical);

    const newRect = {
      id: Date.now(),
      startPrice: Math.max(drawingRect.startPrice, coords.price),
      endPrice: Math.min(drawingRect.startPrice, coords.price),
      startTime: Math.min(drawingRect.startTime, coords.time),
      endTime: Math.max(drawingRect.startTime, coords.time),
      startLogical: logicalLeft,
      endLogical: logicalRight,
      color: rectColor,
      extend: false,
    };

    setRectangles(prev => [...prev, newRect]);
    setDrawingRect(null);
    setPreviewRect(null);
  };

  // 打開矩形編輯器
  const openRectEditor = (rect) => {
    setEditingRect(rect);
    setRectForm({
      topPrice: rect.startPrice.toFixed(2),
      bottomPrice: rect.endPrice.toFixed(2),
      color: rect.color,
      extend: rect.extend !== false,
    });
    setShowRectEditor(true);
  };

  // 保存矩形編輯
  const saveRect = () => {
    if (!editingRect) return;

    const topPrice = parseFloat(rectForm.topPrice);
    const bottomPrice = parseFloat(rectForm.bottomPrice);

    if (isNaN(topPrice) || isNaN(bottomPrice)) return;

    setRectangles(prev => prev.map(r => {
      if (r.id === editingRect.id) {
        return {
          ...r,
          startPrice: Math.max(topPrice, bottomPrice),
          endPrice: Math.min(topPrice, bottomPrice),
          color: rectForm.color,
          extend: rectForm.extend,
        };
      }
      return r;
    }));

    setShowRectEditor(false);
    setEditingRect(null);
  };

  // 移動線到新價格
  const moveLineToPrice = (lineId, newPrice) => {
    // 先找到要移動的線
    const lineToMove = horizontalLinesRef.current.find(l => l.id === lineId);
    if (!lineToMove) return;

    // 刪除舊的價格線
    try {
      candlestickSeriesRef.current.removePriceLine(lineToMove.priceLineRef);
    } catch (e) {
      console.log('刪除舊線失敗:', e);
    }

    // 創建新的價格線
    const newPriceLine = candlestickSeriesRef.current.createPriceLine({
      price: newPrice,
      color: lineToMove.color,
      lineWidth: 2,
      lineStyle: lineToMove.lineStyle,
      axisLabelVisible: true,
      title: lineToMove.label,
    });

    // 更新狀態
    setHorizontalLines(prev => prev.map(line => {
      if (line.id === lineId) {
        return {
          ...line,
          price: newPrice,
          priceLineRef: newPriceLine,
        };
      }
      return line;
    }));
  };

  // 雙擊進入移動模式或編輯矩形
  const handleDoubleClick = (e) => {
    if (!candlestickSeriesRef.current || !chartContainerRef.current || !chartRef.current) return;

    const containerRect = chartContainerRef.current.getBoundingClientRect();
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;
    const clickedPrice = candlestickSeriesRef.current.coordinateToPrice(y);

    if (clickedPrice === null) return;

    // 先檢查是否點擊在矩形內（用已算好的像素座標）
    const clickedRectPixel = rectPixelsRef.current.find(rp =>
      x >= rp.x && x <= rp.x + rp.width &&
      y >= rp.y && y <= rp.y + rp.height
    );
    const clickedRect = clickedRectPixel
      ? rectanglesRef.current.find(r => r.id === clickedRectPixel.id)
      : null;

    if (clickedRect) {
      // 已在編輯此矩形 → 退出；否則進入編輯模式
      setEditingRectId(prev => prev === clickedRect.id ? null : clickedRect.id);
      return;
    }

    // 找出最接近的線（容差範圍內）
    const lines = horizontalLinesRef.current;
    const tolerance = Math.abs(clickedPrice * 0.002); // 0.2% 容差

    const nearestLine = lines.find(line =>
      Math.abs(line.price - clickedPrice) <= tolerance
    );

    if (nearestLine) {
      setMovingLine(nearestLine.id);
    }
  };

  // 清除所有繪圖
  const clearAllDrawings = () => {
    horizontalLines.forEach(line => {
      try {
        candlestickSeriesRef.current.removePriceLine(line.priceLineRef);
      } catch (e) {}
    });
    setHorizontalLines([]);
    setRectangles([]);
    setDrawingRect(null);
    setPriceLabels([]);
    setTrendLines([]);
    setDrawingTrendLine(null);
    drawingTrendLineRef.current = null;
    setPreviewTrendLine(null);
  };

  // 點到線段的距離（用於趨勢線點擊判定）
  const pointToSegmentDistance = (px, py, x1, y1, x2, y2) => {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  };

  // 時間轉像素坐標（支援未來區域）
  const timeToPixel = (time) => {
    if (!chartRef.current || !data || data.length === 0) return null;

    const timeScale = chartRef.current.timeScale();

    // 先嘗試直接轉換
    let x = timeScale.timeToCoordinate(time);
    if (x !== null) return x;

    // 如果是未來時間，手動計算
    const visibleRange = timeScale.getVisibleLogicalRange();
    if (!visibleRange) return null;

    const chartWidth = chartContainerRef.current?.clientWidth || 800;
    const lastCandle = data[data.length - 1];
    const timeInterval = data.length > 1 ? data[data.length - 1].time - data[data.length - 2].time : 300;

    // 計算這個時間對應的邏輯索引
    const barsFromLast = (time - lastCandle.time) / timeInterval;
    const logicalIndex = (data.length - 1) + barsFromLast;

    // 轉換為像素
    x = ((logicalIndex - visibleRange.from) / (visibleRange.to - visibleRange.from)) * chartWidth;
    return x;
  };

  // 更新矩形像素坐標
  const updateRectPixels = () => {
    if (!chartRef.current || !candlestickSeriesRef.current || rectangles.length === 0) {
      setRectPixels([]);
      return;
    }

    const priceScale = candlestickSeriesRef.current;
    const chartWidth = chartContainerRef.current?.clientWidth || 800;

    const timeScale = chartRef.current.timeScale();

    const pixels = rectangles.map(rect => {
      try {
        const y1 = priceScale.priceToCoordinate(rect.startPrice);
        const y2 = priceScale.priceToCoordinate(rect.endPrice);
        if (y1 === null || y2 === null) return null;

        // 用 logical index 轉像素，正確處理跨天 gap
        const x1 = rect.startLogical != null
          ? timeScale.logicalToCoordinate(rect.startLogical)
          : timeToPixel(rect.startTime);
        if (x1 === null) return null;

        // 延伸模式：右邊界固定在圖表右緣
        const x2 = rect.extend
          ? chartWidth
          : rect.endLogical != null
            ? timeScale.logicalToCoordinate(rect.endLogical)
            : timeToPixel(rect.endTime);
        if (x2 === null) return null;

        return {
          id: rect.id,
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          width: Math.abs(x2 - x1),
          height: Math.abs(y2 - y1),
          color: rect.color,
        };
      } catch (e) {
        return null;
      }
    }).filter(Boolean);

    setRectPixels(pixels);
  };

  // 刪除矩形
  const deleteRectangle = (rectId) => {
    setRectangles(prev => prev.filter(r => r.id !== rectId));
  };

  // 右鍵點擊編輯線條或刪除矩形
  const handleContextMenu = (e) => {
    if (!candlestickSeriesRef.current || !chartContainerRef.current || !chartRef.current) return;

    const containerRect = chartContainerRef.current.getBoundingClientRect();
    const x = e.clientX - containerRect.left;
    const y = e.clientY - containerRect.top;
    const clickedPrice = candlestickSeriesRef.current.coordinateToPrice(y);

    if (clickedPrice === null) return;

    // 檢查是否點擊在矩形內（用已算好的像素座標）
    const clickedRectPixel = rectPixelsRef.current.find(rp =>
      x >= rp.x && x <= rp.x + rp.width &&
      y >= rp.y && y <= rp.y + rp.height
    );
    const clickedRect = clickedRectPixel
      ? rectanglesRef.current.find(r => r.id === clickedRectPixel.id)
      : null;

    if (clickedRect) {
      e.preventDefault();
      // 右鍵打開編輯器
      openRectEditor(clickedRect);
      return;
    }

    // 找出最接近的線（容差範圍內）
    const lines = horizontalLinesRef.current;
    const tolerance = Math.abs(clickedPrice * 0.002); // 0.2% 容差

    const nearestLine = lines.find(line =>
      Math.abs(line.price - clickedPrice) <= tolerance
    );

    if (nearestLine) {
      e.preventDefault();
      openLineEditor(null, nearestLine);
      return;
    }

    // 找出最接近的趨勢線（8px 以內）
    const nearestTrendLine = trendLinePixelsRef.current.find(tl =>
      pointToSegmentDistance(x, y, tl.x1, tl.y1, tl.x2, tl.y2) < 8
    );
    if (nearestTrendLine) {
      e.preventDefault();
      setTrendLines(prev => prev.filter(l => l.id !== nearestTrendLine.id));
    }
  };

  // 初始化圖表
  useEffect(() => {
    if (!chartContainerRef.current) {
      console.log('❌ 圖表容器不存在');
      return;
    }

    const containerWidth = chartContainerRef.current.clientWidth;
    const containerHeight = chartContainerRef.current.clientHeight;

    console.log('📏 圖表容器尺寸:', { width: containerWidth, height: containerHeight });

    if (containerWidth === 0 || containerHeight === 0) {
      console.error('❌ 圖表容器尺寸為 0，無法創建圖表');
      return;
    }

    try {
      // 創建圖表實例
      const chart = createChart(chartContainerRef.current, {
        width: containerWidth,
        height: containerHeight,
        localization: {
          timeFormatter: (timestamp) => {
            const d = new Date((timestamp + 6 * 3600) * 1000);
            const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
            const dd = String(d.getUTCDate()).padStart(2, '0');
            const hh = String(d.getUTCHours()).padStart(2, '0');
            const min = String(d.getUTCMinutes()).padStart(2, '0');
            return `${mm}/${dd} ${hh}:${min}`;
          },
        },
        layout: {
          backgroundColor: '#ffffff',
          textColor: '#191919',
        },
        grid: {
          vertLines: { color: '#e1e3e6' },
          horzLines: { color: '#e1e3e6' },
        },
        crosshair: {
          mode: 1,
        },
        rightPriceScale: {
          borderColor: '#d1d4dc',
          scaleMargins: {
            top: 0.1,
            bottom: 0.1,
          },
        },
        timeScale: {
          borderColor: '#d1d4dc',
          timeVisible: true,
          secondsVisible: false,
          barSpacing: 1,
          minBarSpacing: 2,
        },
      });

      console.log('✅ 圖表實例創建成功', chart);

      // 創建蜡烛圖系列（傳統黑白陰陽燭）
      const candlestickSeries = chart.addCandlestickSeries({
        upColor: 'rgba(255, 255, 255, 0.8)',  // 陽線（漲）- 白色空心（稍微透明让边框更明显）
        downColor: '#000000',                  // 陰線（跌）- 黑色實心
        borderVisible: true,
        borderUpColor: '#000000',              // 陽線邊框 - 黑色
        borderDownColor: '#000000',            // 陰線邊框 - 黑色
        wickUpColor: '#000000',                // 陽線影線 - 黑色
        wickDownColor: '#000000',              // 陰線影線 - 黑色
        wickVisible: true,
      });

      console.log('✅ 蠟燭圖系列創建成功');

      chartRef.current = chart;
      candlestickSeriesRef.current = candlestickSeries;

      // 監聽十字線移動
      chart.subscribeCrosshairMove((param) => {
        if (param.time) {
          const candleData = param.seriesData.get(candlestickSeries);
          if (candleData) {
            setChartInfo({
              open: candleData.open,
              high: candleData.high,
              low: candleData.low,
              close: candleData.close,
            });
          }
        }
      });

      // 監聽圖表點擊（用於繪圖工具）
      chart.subscribeClick(handleChartClick);

      // 響應式調整大小
      const handleResize = () => {
        if (chartContainerRef.current) {
          chart.applyOptions({
            width: chartContainerRef.current.clientWidth,
            height: chartContainerRef.current.clientHeight,
          });
        }
      };

      window.addEventListener('resize', handleResize);

      // 右鍵點擊編輯線條
      chartContainerRef.current.addEventListener('contextmenu', handleContextMenu);

      // 雙擊移動線條或編輯矩形
      chartContainerRef.current.addEventListener('dblclick', handleDoubleClick);

      return () => {
        window.removeEventListener('resize', handleResize);
        chartContainerRef.current?.removeEventListener('contextmenu', handleContextMenu);
        chartContainerRef.current?.removeEventListener('dblclick', handleDoubleClick);
        chart.remove();
      };
    } catch (error) {
      console.error('❌ 圖表初始化失敗:', error);
    }
  }, []);

  // 更新 K 線數據
  useEffect(() => {
    if (!candlestickSeriesRef.current || !data || data.length === 0) {
      console.log('⚠️ 無法更新圖表:', {
        hasSeries: !!candlestickSeriesRef.current,
        hasData: !!data,
        dataLength: data?.length || 0
      });
      return;
    }

    // 轉換數據格式為 TradingView 所需格式
    const formattedData = data.map(candle => ({
      time: candle.time,
      open: parseFloat(candle.open),
      high: parseFloat(candle.high),
      low: parseFloat(candle.low),
      close: parseFloat(candle.close),
    }));

    try {
      // 判斷是否為新資料集（換日期或換 Session）
      const newStartTime = formattedData[0]?.time ?? null;
      const isNewDataset = newStartTime !== lastDataStartTimeRef.current;
      lastDataStartTimeRef.current = newStartTime;

      candlestickSeriesRef.current.setData(formattedData);

      // 只在新資料集載入時才重設視角，播放中追加 K 棒不強制跳視角
      if (isNewDataset && chartRef.current && formattedData.length > 0) {
        const dataLength = formattedData.length;
        const halfBars = Math.floor(visibleBars / 2);
        const from = Math.max(0, dataLength - halfBars);
        const to = dataLength + halfBars;

        setTimeout(() => {
          if (chartRef.current) {
            chartRef.current.timeScale().setVisibleLogicalRange({ from, to });
          }
        }, 0);
      }
    } catch (error) {
      console.error('❌ 設置圖表數據失敗:', error);
    }
  }, [data, visibleBars]);

  // 添加日期標記、訂單標記和反轉訊號標記
  useEffect(() => {
    if (!candlestickSeriesRef.current || !data || data.length === 0) return;

    const dayMarkers = [];

    // 日線、週線、月線不需要日期標記
    const dailyOrLonger = ['1d', '1w', '1M'];
    if (!dailyOrLonger.includes(timeframe)) {
      // 找出每天的第一根 K 棒
      let lastDate = null;
      const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

      data.forEach((candle) => {
        const timestamp = candle.time;
        const date = new Date(timestamp * 1000);
        const dateStr = date.toISOString().split('T')[0];
        const dayOfWeek = date.getDay();

        if (lastDate !== null && dateStr !== lastDate) {
          // 在每天開始處添加標記
          dayMarkers.push({
            time: timestamp,
            position: 'aboveBar',
            color: '#2196F3',
            shape: 'square',
            text: `${date.getMonth() + 1}/${date.getDate()} (${dayNames[dayOfWeek]})`,
            size: 0.5,
          });
        }
        lastDate = dateStr;
      });
    }

    // 訂單標記
    const orderMarkers = (orders || []).map(order => ({
      time: order.time,
      position: order.type === 'buy' ? 'belowBar' : 'aboveBar',
      color: order.type === 'buy' ? '#26a69a' : '#ef5350',
      shape: order.type === 'buy' ? 'arrowUp' : 'arrowDown',
      text: order.type === 'buy' ? `買 @${order.price}` : `賣 @${order.price}`,
    }));

    // 反轉訊號標記
    const signalMarkers = (reversalSignals || []).map(signal => {
      // 找到對應的K棒時間（需要在顯示數據中找最接近的）
      const matchingCandle = data.find(c => {
        const candleTime = typeof c.time === 'number' ? c.time : new Date(c.time).getTime() / 1000;
        const signalTime = signal.time;
        // 允許一定的時間誤差（同一根K棒內）
        return Math.abs(candleTime - signalTime) < 14400; // 4小時內
      });

      if (!matchingCandle) return null;

      const timeframeText = signal.timeframes.join('/');

      return {
        time: matchingCandle.time,
        position: signal.type === 'bullish' ? 'belowBar' : 'aboveBar',
        color: signal.type === 'bullish' ? '#4CAF50' : '#f44336',
        shape: signal.type === 'bullish' ? 'arrowUp' : 'arrowDown',
        text: signal.type === 'bullish' ? `轉多 ${timeframeText}` : `轉空 ${timeframeText}`,
        size: 1,
      };
    }).filter(Boolean);

    const allMarkers = [...dayMarkers, ...orderMarkers, ...signalMarkers].sort((a, b) => a.time - b.time);
    candlestickSeriesRef.current.setMarkers(allMarkers);

    console.log('📅 日期標記:', dayMarkers.length, '個, 🔔 反轉訊號:', signalMarkers.length, '個');

  }, [data, timeframe, orders, reversalSignals]);

  // 矩形坐標更新（當圖表滾動/縮放或矩形變化時）
  useEffect(() => {
    if (!chartRef.current) return;

    updateRectPixels();

    // 訂閱時間軸變化
    const timeScale = chartRef.current.timeScale();
    const handleVisibleRangeChange = () => {
      updateRectPixels();
    };

    timeScale.subscribeVisibleLogicalRangeChange(handleVisibleRangeChange);

    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(handleVisibleRangeChange);
    };
  }, [rectangles, data]);

  // 價格標注像素位置更新
  useEffect(() => {
    if (!chartRef.current) return;
    updateLabelPixels();
    const timeScale = chartRef.current.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(updateLabelPixels);
    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(updateLabelPixels);
    };
  }, [priceLabels]);

  // 趨勢線像素位置更新
  useEffect(() => {
    if (!chartRef.current) return;
    updateTrendLinePixels();
    const timeScale = chartRef.current.timeScale();
    timeScale.subscribeVisibleLogicalRangeChange(updateTrendLinePixels);
    return () => {
      timeScale.unsubscribeVisibleLogicalRangeChange(updateTrendLinePixels);
    };
  }, [trendLines, data]);

  // 趨勢線預覽滑鼠追蹤
  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;
    const handleMouseMoveForPreview = (e) => {
      if (activeToolRef.current !== 'trendline' || !drawingTrendLineRef.current) {
        setPreviewTrendLine(null);
        return;
      }
      if (!chartRef.current || !candlestickSeriesRef.current) return;
      const containerRect = container.getBoundingClientRect();
      const x2 = e.clientX - containerRect.left;
      const y2 = e.clientY - containerRect.top;
      const timeScale = chartRef.current.timeScale();
      const x1 = timeScale.logicalToCoordinate(drawingTrendLineRef.current.logical);
      const y1 = candlestickSeriesRef.current.priceToCoordinate(drawingTrendLineRef.current.price);
      if (x1 === null || y1 === null) return;
      setPreviewTrendLine({ x1, y1, x2, y2 });
    };
    container.addEventListener('mousemove', handleMouseMoveForPreview);
    return () => container.removeEventListener('mousemove', handleMouseMoveForPreview);
  }, []);

  // 水平線像素 Y 座標更新（垂直縮放、線變動時重算）
  useEffect(() => {
    if (!chartRef.current) return;
    updateHLinePixels();
    const timeScale = chartRef.current.timeScale();
    // 縮放/滾動時也更新（價格軸縮放會改變 Y）
    timeScale.subscribeVisibleLogicalRangeChange(updateHLinePixels);
    return () => timeScale.unsubscribeVisibleLogicalRangeChange(updateHLinePixels);
  }, [horizontalLines]);

  // 水平線拖曳（document 級別，mount 一次）
  useEffect(() => {
    const handleDragMove = (e) => {
      if (!hLineDragIdRef.current || !candlestickSeriesRef.current || !chartContainerRef.current) return;
      const containerRect = chartContainerRef.current.getBoundingClientRect();
      const y = e.clientY - containerRect.top;
      const newPrice = candlestickSeriesRef.current.coordinateToPrice(y);
      if (newPrice === null) return;
      hLineDragPriceRef.current = newPrice;
      // 直接呼叫 applyOptions — 不 setState，避免 re-render
      const line = horizontalLinesRef.current.find(l => l.id === hLineDragIdRef.current);
      if (line?.priceLineRef) {
        try { line.priceLineRef.applyOptions({ price: newPrice }); } catch (e) {}
      }
    };
    const handleDragEnd = () => {
      if (!hLineDragIdRef.current) return;
      const finalPrice = hLineDragPriceRef.current;
      if (finalPrice !== null) {
        // 更新 React state（讓 hLinePixels 也跟著更新）
        setHorizontalLines(prev => prev.map(l =>
          l.id === hLineDragIdRef.current ? { ...l, price: finalPrice } : l
        ));
      }
      hLineDragIdRef.current = null;
      hLineDragPriceRef.current = null;
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', handleDragEnd);
    };

    // 存到 ref 讓拖曳把手可以呼叫
    window.__hLineDragHandlers = { handleDragMove, handleDragEnd };
    return () => { delete window.__hLineDragHandlers; };
  }, []);

  // 開始拖曳水平線
  const startHLineDrag = (e, lineId) => {
    e.preventDefault();
    e.stopPropagation();
    hLineDragIdRef.current = lineId;
    hLineDragPriceRef.current = null;
    document.body.style.cursor = 'ns-resize';
    const { handleDragMove, handleDragEnd } = window.__hLineDragHandlers || {};
    if (handleDragMove) document.addEventListener('mousemove', handleDragMove);
    if (handleDragEnd) document.addEventListener('mouseup', handleDragEnd);
  };

  // 訂單價格線顯示（進場價、止損、止盈）
  useEffect(() => {
    if (!candlestickSeriesRef.current) return;

    // 先清除舊的訂單價格線
    orderLinesRef.current.forEach(line => {
      try {
        candlestickSeriesRef.current.removePriceLine(line);
      } catch (e) {}
    });
    orderLinesRef.current = [];

    // 為每個訂單創建價格線
    positions.forEach(pos => {
      // 預掛單進場價 - 藍色虛線
      if (pos.status === 'pending' && pos.entryPrice) {
        const entryLine = candlestickSeriesRef.current.createPriceLine({
          price: pos.entryPrice,
          color: '#2196F3',  // 藍色
          lineWidth: 2,
          lineStyle: 2,  // 虛線
          axisLabelVisible: true,
          title: `${pos.type === 'buy' ? 'BUY' : 'SELL'} @ ${pos.entryPrice.toFixed(2)}`,
        });
        orderLinesRef.current.push(entryLine);
      }

      // 止損價 - 紅色虛線
      if (pos.stopLoss) {
        const slLine = candlestickSeriesRef.current.createPriceLine({
          price: pos.stopLoss,
          color: '#f44336',  // 紅色
          lineWidth: 2,
          lineStyle: 2,  // 虛線
          axisLabelVisible: true,
          title: `SL ${pos.stopLoss.toFixed(2)}`,
        });
        orderLinesRef.current.push(slLine);
      }

      // 止盈價 - 綠色虛線
      if (pos.takeProfit) {
        const tpLine = candlestickSeriesRef.current.createPriceLine({
          price: pos.takeProfit,
          color: '#4CAF50',  // 綠色
          lineWidth: 2,
          lineStyle: 2,  // 虛線
          axisLabelVisible: true,
          title: `TP ${pos.takeProfit.toFixed(2)}`,
        });
        orderLinesRef.current.push(tpLine);
      }

      // 已開倉訂單的進場價 - 顯示實際進場位置（淺藍色虛線）
      if (pos.status === 'open' && pos.entryPrice) {
        const openEntryLine = candlestickSeriesRef.current.createPriceLine({
          price: pos.entryPrice,
          color: '#0474a8',  // 淺藍色
          lineWidth: 2,
          lineStyle: 2,  // 虛線
          axisLabelVisible: true,
          title: `${pos.type === 'buy' ? '買入' : '賣出'} ${pos.entryPrice.toFixed(2)}`,
        });
        orderLinesRef.current.push(openEntryLine);
      }
    });

    console.log('📍 訂單價格線更新:', orderLinesRef.current.length, '條');

  }, [positions]);


  const latestCandle = (data && data.length > 0) ? data[data.length - 1] : null;
  const displayInfo = chartInfo || latestCandle;

  return (
    <div className="charts">
      <div className="chart-header">
        {displayInfo && (
          <div className="chart-info">
            <span>開 <strong>{parseFloat(displayInfo.open).toFixed(2)}</strong></span>
            <span>高 <strong>{parseFloat(displayInfo.high).toFixed(2)}</strong></span>
            <span>低 <strong>{parseFloat(displayInfo.low).toFixed(2)}</strong></span>
            <span>收 <strong>{parseFloat(displayInfo.close).toFixed(2)}</strong></span>
          </div>
        )}
        <div className="drawing-tools">
          <button
            className={`tool-btn ${activeTool === 'hline' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'hline' ? null : 'hline')}
            title="水平線 - 點擊圖表添加"
          >
            —
          </button>
          <button
            className={`tool-btn ${activeTool === 'rect' ? 'active' : ''}`}
            onClick={() => {
              setActiveTool(activeTool === 'rect' ? null : 'rect');
              setDrawingRect(null); // 切換工具時重置繪製狀態
            }}
            title="矩形 - 拖曳繪製，雙擊編輯"
          >
            ▢
          </button>
          <button
            className={`tool-btn ${activeTool === 'label' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'label' ? null : 'label')}
            title="價格標注 - 點擊圖表標注價格"
          >
            ⌖
          </button>
          <button
            className={`tool-btn ${activeTool === 'trendline' ? 'active' : ''}`}
            onClick={() => setActiveTool(activeTool === 'trendline' ? null : 'trendline')}
            title="趨勢線 - 點兩次繪製，右鍵刪除"
          >
            ╱
          </button>
          {(horizontalLines.length > 0 || rectangles.length > 0 || priceLabels.length > 0 || trendLines.length > 0) && (
            <button
              className="tool-btn clear-btn"
              onClick={clearAllDrawings}
              title="清除所有"
            >
              ×
            </button>
          )}
          {activeTool === 'hline' && (
            <span className="tool-hint">點擊圖表添加水平線</span>
          )}
          {activeTool === 'rect' && (
            <div className="rect-color-picker">
              {RECT_COLORS.map(c => (
                <button
                  key={c.value}
                  className={`rect-color-btn ${rectColor === c.value ? 'active' : ''}`}
                  style={{ backgroundColor: c.value.replace('0.2)', '0.6)') }}
                  onClick={() => setRectColor(c.value)}
                  title={c.name}
                />
              ))}
            </div>
          )}
          {activeTool === 'rect' && !drawingRect && (
            <span className="tool-hint">拖曳繪製矩形</span>
          )}
          {activeTool === 'rect' && drawingRect && (
            <span className="tool-hint">放開完成矩形</span>
          )}
          {activeTool === 'label' && (
            <div className="rect-color-picker">
              {['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#000000'].map(c => (
                <button
                  key={c}
                  className={`rect-color-btn ${labelColor === c ? 'active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setLabelColor(c)}
                />
              ))}
            </div>
          )}
          {activeTool === 'label' && (
            <span className="tool-hint">點擊圖表標注價格</span>
          )}
          {activeTool === 'trendline' && (
            <div className="rect-color-picker">
              {['#ef4444', '#2196F3', '#4CAF50', '#ff9800', '#9c27b0', '#000000'].map(c => (
                <button
                  key={c}
                  className={`rect-color-btn ${trendLineColor === c ? 'active' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setTrendLineColor(c)}
                />
              ))}
            </div>
          )}
          {activeTool === 'trendline' && !drawingTrendLine && (
            <span className="tool-hint">點擊第一個點（自動吸附高/低點）</span>
          )}
          {activeTool === 'trendline' && drawingTrendLine && (
            <span className="tool-hint">點擊第二個點完成趨勢線</span>
          )}
          {trendLines.length > 0 && !activeTool && (
            <span className="lines-count">{trendLines.length} 條趨勢線（右鍵刪除）</span>
          )}
          {movingLine && (
            <span className="tool-hint moving">點擊新位置移動線 | <button onClick={() => setMovingLine(null)}>取消</button></span>
          )}
          {editingRectId && (
            <span className="tool-hint moving">拖曳移動或調整大小 | <button onClick={() => setEditingRectId(null)}>完成</button></span>
          )}
          {horizontalLines.length > 0 && !movingLine && !activeTool && (
            <span className="lines-count">{horizontalLines.length} 條線（可拖曳，右鍵編輯）</span>
          )}
          {rectangles.length > 0 && !activeTool && !editingRectId && (
            <span className="lines-count">{rectangles.length} 個矩形（雙擊編輯，右鍵設定）</span>
          )}
        </div>
      </div>

      {/* 水平線編輯器 */}
      {showLineEditor && (
        <div className="line-editor-overlay">
          <div className="line-editor">
            <h3>{editingLine ? '編輯水平線' : '添加水平線'}</h3>

            <div className="form-group">
              <label>價格:</label>
              <input
                type="number"
                step="0.01"
                value={lineForm.price}
                onChange={(e) => setLineForm({ ...lineForm, price: e.target.value })}
                placeholder="輸入價格"
              />
            </div>

            <div className="form-group">
              <label>顏色:</label>
              <div className="color-options">
                {LINE_COLORS.map(c => (
                  <button
                    key={c.value}
                    className={`color-btn ${lineForm.color === c.value ? 'active' : ''}`}
                    style={{ backgroundColor: c.value }}
                    onClick={() => setLineForm({ ...lineForm, color: c.value })}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            <div className="form-group">
              <label>樣式:</label>
              <select
                value={lineForm.lineStyle}
                onChange={(e) => setLineForm({ ...lineForm, lineStyle: parseInt(e.target.value) })}
              >
                <option value={0}>實線 ───</option>
                <option value={1}>虛線 - - -</option>
                <option value={2}>點線 ···</option>
              </select>
            </div>

            <div className="form-group">
              <label>備註:</label>
              <input
                type="text"
                value={lineForm.label}
                onChange={(e) => setLineForm({ ...lineForm, label: e.target.value })}
                placeholder="例如: 支撐位、阻力位"
              />
            </div>

            <div className="editor-buttons">
              <button className="btn-save" onClick={saveLine}>
                {editingLine ? '更新' : '添加'}
              </button>
              {editingLine && (
                <button className="btn-delete" onClick={() => deleteLine(editingLine.id)}>
                  刪除
                </button>
              )}
              <button className="btn-cancel" onClick={() => setShowLineEditor(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 矩形編輯器 */}
      {showRectEditor && editingRect && (
        <div className="line-editor-overlay">
          <div className="line-editor">
            <h3>編輯矩形</h3>

            <div className="form-group">
              <label>上邊界價格:</label>
              <input
                type="number"
                step="0.01"
                value={rectForm.topPrice}
                onChange={(e) => setRectForm({ ...rectForm, topPrice: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>下邊界價格:</label>
              <input
                type="number"
                step="0.01"
                value={rectForm.bottomPrice}
                onChange={(e) => setRectForm({ ...rectForm, bottomPrice: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label>
                <input
                  type="checkbox"
                  checked={rectForm.extend}
                  onChange={(e) => setRectForm({ ...rectForm, extend: e.target.checked })}
                  style={{ marginRight: 6 }}
                />
                延伸到最新K棒
              </label>
            </div>

            <div className="form-group">
              <label>顏色:</label>
              <div className="color-options">
                {RECT_COLORS.map(c => (
                  <button
                    key={c.value}
                    className={`color-btn ${rectForm.color === c.value ? 'active' : ''}`}
                    style={{ backgroundColor: c.value.replace('0.2)', '0.6)') }}
                    onClick={() => setRectForm({ ...rectForm, color: c.value })}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            <div className="editor-buttons">
              <button className="btn-save" onClick={saveRect}>
                更新
              </button>
              <button className="btn-delete" onClick={() => {
                deleteRectangle(editingRect.id);
                setShowRectEditor(false);
                setEditingRect(null);
              }}>
                刪除
              </button>
              <button className="btn-cancel" onClick={() => {
                setShowRectEditor(false);
                setEditingRect(null);
              }}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="chart-canvas" ref={chartContainerRef}>
        {/* 矩形 + 趨勢線繪製覆蓋層 */}
        <svg className="rect-overlay">
          {/* 已完成的矩形 */}
          {rectPixels.map(rect => (
            <rect
              key={rect.id}
              x={rect.x}
              y={rect.y}
              width={rect.width}
              height={rect.height}
              fill={rect.color}
              stroke={editingRectId === rect.id ? '#2196F3' : rect.color.replace('0.2)', '0.8)')}
              strokeWidth={editingRectId === rect.id ? 2 : 1}
              strokeDasharray={editingRectId === rect.id ? '5,3' : 'none'}
            />
          ))}
          {/* 拖曳中的預覽矩形 */}
          {previewRect && (
            <rect
              x={previewRect.x}
              y={previewRect.y}
              width={previewRect.width}
              height={previewRect.height}
              fill={previewRect.color}
              stroke={previewRect.color.replace('0.2)', '0.8)')}
              strokeWidth="2"
              strokeDasharray="5,5"
            />
          )}
          {/* 已完成的趨勢線 */}
          {trendLinePixels.map(tl => (
            <line
              key={tl.id}
              x1={tl.x1} y1={tl.y1}
              x2={tl.x2} y2={tl.y2}
              stroke={tl.color}
              strokeWidth="2"
              strokeLinecap="round"
            />
          ))}
          {/* 趨勢線預覽（第一點已設，滑鼠移動時顯示） */}
          {previewTrendLine && (
            <line
              x1={previewTrendLine.x1} y1={previewTrendLine.y1}
              x2={previewTrendLine.x2} y2={previewTrendLine.y2}
              stroke={trendLineColor}
              strokeWidth="2"
              strokeDasharray="6,4"
              strokeLinecap="round"
              opacity="0.7"
            />
          )}
          {/* 第一個點的標記 */}
          {drawingTrendLine && (() => {
            const ts = chartRef.current?.timeScale();
            const x = ts?.logicalToCoordinate(drawingTrendLine.logical);
            const y = candlestickSeriesRef.current?.priceToCoordinate(drawingTrendLine.price);
            if (x === null || y === null || x === undefined || y === undefined) return null;
            return <circle cx={x} cy={y} r="5" fill={trendLineColor} opacity="0.9" />;
          })()}
        </svg>
        {/* 水平線拖曳把手（透明橫條，覆蓋在線上） */}
        {hLinePixels.map(hp => (
          hp.y !== null && (
            <div
              key={hp.id}
              style={{
                position: 'absolute',
                left: 0,
                right: 70, // 不蓋到右側價格軸（約 65-70px 寬）
                top: hp.y - 6,
                height: 12,
                cursor: 'ns-resize',
                zIndex: 10,
              }}
              onMouseDown={(e) => startHLineDrag(e, hp.id)}
            />
          )
        ))}
        {/* 價格標注 */}
        {priceLabelPixels.map(px => {
          const label = priceLabels.find(l => l.id === px.id);
          if (!label || px.y === null || px.y === undefined || px.x === null) return null;
          return (
            <div
              key={label.id}
              className={`price-label-tag ${px.isHigh ? 'label-high' : 'label-low'}`}
              style={{ left: px.x, top: px.y, borderColor: label.color }}
            >
              <span style={{ color: label.color }}>{label.price.toFixed(2)}</span>
              <button
                className="price-label-delete"
                onClick={() => setPriceLabels(prev => prev.filter(l => l.id !== label.id))}
              >×</button>
            </div>
          );
        })}
        {/* 矩形編輯模式 - 顯示拖曳把手 */}
        {editingRectId && rectPixels.find(r => r.id === editingRectId) && (() => {
          const editRect = rectPixels.find(r => r.id === editingRectId);
          const handleSize = 12;
          return (
            <div className="rect-edit-layer">
              {/* 移動整個矩形的區域 */}
              <div
                className="rect-move-area"
                style={{
                  left: editRect.x,
                  top: editRect.y,
                  width: editRect.width,
                  height: editRect.height,
                }}
                onMouseDown={(e) => handleEditDragStart(e, 'move')}
              />
              {/* 四個角落的調整把手 */}
              <div
                className="rect-handle rect-handle-tl"
                style={{ left: editRect.x - handleSize/2, top: editRect.y - handleSize/2 }}
                onMouseDown={(e) => handleEditDragStart(e, 'resize-tl')}
              />
              <div
                className="rect-handle rect-handle-tr"
                style={{ left: editRect.x + editRect.width - handleSize/2, top: editRect.y - handleSize/2 }}
                onMouseDown={(e) => handleEditDragStart(e, 'resize-tr')}
              />
              <div
                className="rect-handle rect-handle-bl"
                style={{ left: editRect.x - handleSize/2, top: editRect.y + editRect.height - handleSize/2 }}
                onMouseDown={(e) => handleEditDragStart(e, 'resize-bl')}
              />
              <div
                className="rect-handle rect-handle-br"
                style={{ left: editRect.x + editRect.width - handleSize/2, top: editRect.y + editRect.height - handleSize/2 }}
                onMouseDown={(e) => handleEditDragStart(e, 'resize-br')}
              />
            </div>
          );
        })()}
        {/* 矩形繪製時的互動層 - 只在 rect 工具啟用時出現 */}
        {activeTool === 'rect' && (
          <div
            className="rect-draw-layer"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        )}
      </div>

      {/* 矩形拖曳時的全螢幕捕獲層 */}
      {dragMode !== null && (
        <div
          style={{
            position: 'fixed',
            top: 0, left: 0,
            width: '100vw', height: '100vh',
            zIndex: 99999,
            cursor: dragMode === 'move' ? 'move' : 'nwse-resize',
          }}
          onMouseMove={(e) => {
            // stopPropagation 停止 native event bubble 到 <html>
            // 防止 lightweight-charts 在 html 上的 mousemove listener 觸發 panning
            e.nativeEvent.stopPropagation();
            handleEditDragMoveDoc(e);
          }}
          onMouseUp={(e) => {
            e.nativeEvent.stopPropagation();
            handleEditDragEndDoc();
          }}
        />
      )}
    </div>
  );
}

export default Charts;
