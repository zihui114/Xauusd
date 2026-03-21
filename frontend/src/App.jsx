import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Charts from './components/Charts';
import TradingPanel from './components/TradingPanel';
import TradeHistory from './components/TradeHistory';
import Controls from './components/Controls';
import AuthPanel from './components/AuthPanel';
import SessionHistory from './components/SessionHistory';
import './App.css';

function App() {
  const [initialBalance, setInitialBalance] = useState(10000);
  const [balance, setBalance] = useState(10000);
  const [positions, setPositions] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeframe, setTimeframe] = useState('1h');
  const [startDate, setStartDate] = useState('2025-12-01');
  const [speed, setSpeed] = useState(1);
  const [showTradingPanel, setShowTradingPanel] = useState(false);
  const [showTradeHistory, setShowTradeHistory] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);

  // 用戶認證
  const [currentUser, setCurrentUser] = useState(null);
  const [showAuth, setShowAuth] = useState(true);
  const [currentSessionId, setCurrentSessionId] = useState(null);
  const [activeSessionName, setActiveSessionName] = useState(null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [newSessionNameInput, setNewSessionNameInput] = useState('');
  const [showSessionHistory, setShowSessionHistory] = useState(false);
  const currentUserRef = useRef(null);
  const currentSessionIdRef = useRef(null);
  const prevTradeHistoryLengthRef = useRef(0);
  const startDateRef = useRef('2025-12-01');
  const timeframeRef = useRef('1h');
  const initialBalanceRef = useRef(10000);

  // 1分鐘數據（播放源）
  const [minuteData, setMinuteData] = useState([]);
  const [minuteIndex, setMinuteIndex] = useState(0);
  const minuteDataRef = useRef([]);
  const minuteIndexRef = useRef(0);

  // 模擬模式
  const [simulationMode, setSimulationMode] = useState(true);

  // 合成的大週期K棒（用於顯示）
  const [displayCandles, setDisplayCandles] = useState([]);
  const [formingCandle, setFormingCandle] = useState(null); // 正在形成的K棒

  const VISIBLE_BARS = 100;

  // 時間週期對應的分鐘數（基於1分鐘數據源）
  const TIMEFRAME_MINUTES = {
    '1m': 1,      // 1分K = 1根1分鐘數據
    '5m': 5,      // 5分K = 5根1分鐘數據
    '15m': 15,    // 15分K = 15根1分鐘數據
    '30m': 30,    // 30分K = 30根1分鐘數據
    '1h': 60,     // 1小時K = 60根1分鐘數據
    '4h': 240,    // 4小時K = 240根1分鐘數據
    '1d': 1440,   // 日K = 1440根1分鐘數據
    '1w': 10080,  // 週K = 10080根1分鐘數據
  };

  const SOURCE_MINUTES = 1; // 數據源是1分鐘K

  // 訊號檢測時區配置
  const SIGNAL_TIMEFRAMES = {
    '5m': { minutes: 5, label: 'M5' },
    '15m': { minutes: 15, label: 'M15' },
    '30m': { minutes: 30, label: 'M30' },
    '1h': { minutes: 60, label: 'H1' },
    '4h': { minutes: 240, label: 'H4' },
  };

  // 檢測反轉訊號（引線超過實體3倍）
  const isReversalCandle = (candle, type) => {
    const body = Math.abs(candle.close - candle.open);
    const upperWick = candle.high - Math.max(candle.open, candle.close);
    const lowerWick = Math.min(candle.open, candle.close) - candle.low;
    const totalRange = candle.high - candle.low;

    // 實體太小時避免誤判（至少1點）
    if (body < 1) return false;

    // K棒總長度太小時避免誤判（至少5點）
    if (totalRange < 5) return false;

    if (type === 'bullish') {
      // 轉多：下引線 > 實體 × 3，且下引線至少3點，且上引線不可比下引線長
      return lowerWick > body * 3 && lowerWick >= 3 && upperWick <= lowerWick;
    } else {
      // 轉空：上引線 > 實體 × 3，且上引線至少3點，且下引線不可比上引線長
      return upperWick > body * 3 && upperWick >= 3 && lowerWick <= upperWick;
    }
  };

  // 合成指定時區的K棒
  const buildCandlesForTimeframe = useCallback((data, upToIndex, tfMinutes) => {
    if (!data || data.length === 0) return [];

    const candles = [];
    let currentCandle = null;
    let candleStartTime = null;

    for (let i = 0; i <= upToIndex && i < data.length; i++) {
      const bar = data[i];
      const barTime = typeof bar.time === 'number' ? bar.time : new Date(bar.time).getTime() / 1000;
      const periodStart = Math.floor(barTime / (tfMinutes * SOURCE_MINUTES * 60)) * (tfMinutes * SOURCE_MINUTES * 60);

      if (candleStartTime !== periodStart) {
        if (currentCandle) {
          candles.push(currentCandle);
        }
        candleStartTime = periodStart;
        currentCandle = {
          time: periodStart,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        };
      } else {
        currentCandle.high = Math.max(currentCandle.high, bar.high);
        currentCandle.low = Math.min(currentCandle.low, bar.low);
        currentCandle.close = bar.close;
      }
    }
    if (currentCandle) candles.push(currentCandle);
    return candles;
  }, []);

  // 計算反轉訊號
  const reversalSignals = useMemo(() => {
    if (!minuteData || minuteData.length === 0 || minuteIndex === 0) return [];

    const signals = [];

    // 對每個訊號時區進行檢測
    Object.entries(SIGNAL_TIMEFRAMES).forEach(([, config]) => {
      const tfCandles = buildCandlesForTimeframe(minuteData, minuteIndex, config.minutes);
      if (tfCandles.length < 2) return;

      // 按日期分組
      const dailyCandles = {};
      tfCandles.forEach(candle => {
        const date = new Date(candle.time * 1000).toISOString().split('T')[0];
        if (!dailyCandles[date]) {
          dailyCandles[date] = [];
        }
        dailyCandles[date].push(candle);
      });

      // 對每天檢測：只有當天最高的K棒可以是轉空，當天最低的K棒可以是轉多
      Object.entries(dailyCandles).forEach(([date, candles]) => {
        if (candles.length < 2) return;

        // 找當天最高的K棒（high最大）
        const highestCandle = candles.reduce((max, c) => c.high > max.high ? c : max, candles[0]);
        // 找當天最低的K棒（low最小）
        const lowestCandle = candles.reduce((min, c) => c.low < min.low ? c : min, candles[0]);

if (isReversalCandle(highestCandle, 'bearish')) {
          signals.push({
            time: highestCandle.time,
            type: 'bearish',
            timeframe: config.label,
            price: highestCandle.high,
          });
        }

        if (isReversalCandle(lowestCandle, 'bullish')) {
          signals.push({
            time: lowestCandle.time,
            type: 'bullish',
            timeframe: config.label,
            price: lowestCandle.low,
          });
        }
      });
    });

    // 去重（同一時間同一類型只保留一個，但保留所有時區標籤）
    const signalMap = new Map();
    signals.forEach(sig => {
      const key = `${sig.time}-${sig.type}`;
      if (signalMap.has(key)) {
        const existing = signalMap.get(key);
        if (!existing.timeframes.includes(sig.timeframe)) {
          existing.timeframes.push(sig.timeframe);
        }
      } else {
        signalMap.set(key, {
          time: sig.time,
          type: sig.type,
          price: sig.price,
          timeframes: [sig.timeframe],
        });
      }
    });

    return Array.from(signalMap.values());
  }, [minuteData, minuteIndex, buildCandlesForTimeframe]);

  // 載入1分鐘數據
  const loadMinuteData = useCallback(async (targetDate) => {
    try {
      console.log('📊 載入1分鐘數據...');
      // 往前多拉 5 個日曆天的歷史，確保目標日期在資料範圍內
      let fetchStartDate = null;
      if (targetDate) {
        const lookbackMs = 5 * 24 * 60 * 60 * 1000;
        fetchStartDate = new Date(new Date(targetDate).getTime() - lookbackMs).toISOString().split('T')[0];
      }
      const startParam = fetchStartDate ? `&start_date=${fetchStartDate}` : '';
      const response = await fetch(`http://localhost:5001/api/kline?timeframe=1m&limit=15000${startParam}`);
      const result = await response.json();

      if (result.status === 'success' && result.data && result.data.length > 0) {
        setMinuteData(result.data);

        // 找到目標日期的位置
        let initialIndex = 0;
        if (targetDate) {
          const targetTimestamp = new Date(targetDate).getTime() / 1000;
          const foundIndex = result.data.findIndex(d => {
            const t = typeof d.time === 'number' ? d.time : new Date(d.time).getTime() / 1000;
            return t >= targetTimestamp;
          });
          if (foundIndex === -1) {
            // 目標日期超出所有數據之後
            alert(`⚠️ ${targetDate} 超出數據範圍，將跳至最近可用日期`);
            initialIndex = result.data.length - 1;
          } else if (foundIndex === 0) {
            const firstBarTime = typeof result.data[0].time === 'number' ? result.data[0].time : new Date(result.data[0].time).getTime() / 1000;
            if (firstBarTime > targetTimestamp) {
              // 目標日期落在數據缺口中
              const nearestDate = new Date(firstBarTime * 1000).toISOString().split('T')[0];
              alert(`⚠️ ${targetDate} 無數據（數據缺口），自動跳至最近可用日期 ${nearestDate}`);
              initialIndex = 0;
            } else {
              initialIndex = 0;
            }
          } else {
            initialIndex = foundIndex;
          }
        }

        // 顯示數據時間範圍
        const firstTime = new Date(result.data[0].time * 1000).toISOString().split('T')[0];
        const lastTime = new Date(result.data[result.data.length - 1].time * 1000).toISOString().split('T')[0];
        console.log(`📅 數據範圍: ${firstTime} ~ ${lastTime}`);

        setMinuteIndex(initialIndex);
        console.log(`✅ 載入 ${result.data.length} 筆1分鐘數據，起始索引: ${initialIndex}`);

        // 初始化顯示的K棒
        buildDisplayCandles(result.data, initialIndex, timeframe);
      }
    } catch (error) {
      console.error('❌ 載入1分鐘數據失敗:', error);
    }
  }, [timeframe]);

  // 背景預載下一段資料
  const loadNextChunk = useCallback(async (currentData) => {
    if (isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const lastBar = currentData[currentData.length - 1];
      const nextTime = lastBar.time + 60;
      const d = new Date(nextTime * 1000);
      const startStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
      const response = await fetch(`http://localhost:5001/api/kline?timeframe=1m&limit=10000&start_date=${encodeURIComponent(startStr)}`);
      const result = await response.json();
      if (result.status === 'success' && result.data && result.data.length > 0) {
        setMinuteData(prev => [...prev, ...result.data]);
        console.log(`📦 預載下一段: ${result.data.length} 筆`);
      }
    } catch (e) {
      console.error('❌ 預載失敗:', e);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, []);

  // 根據1分鐘數據合成大週期K棒
  const buildDisplayCandles = useCallback((data, upToIndex, tf) => {
    if (!data || data.length === 0) return;

    const minutes = TIMEFRAME_MINUTES[tf] || 60;
    const candles = [];
    let currentCandle = null;
    let candleStartTime = null;

    // 只處理到 upToIndex 為止的數據
    for (let i = 0; i <= upToIndex && i < data.length; i++) {
      const bar = data[i];
      const barTime = typeof bar.time === 'number' ? bar.time : new Date(bar.time).getTime() / 1000;

      // 計算這根5分K屬於哪個大週期
      const periodStart = Math.floor(barTime / (minutes * SOURCE_MINUTES * 60)) * (minutes * SOURCE_MINUTES * 60);

      if (candleStartTime !== periodStart) {
        // 新的大週期開始
        if (currentCandle) {
          candles.push(currentCandle);
        }
        candleStartTime = periodStart;
        currentCandle = {
          time: periodStart,
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        };
      } else {
        // 同一個大週期，更新 OHLC
        currentCandle.high = Math.max(currentCandle.high, bar.high);
        currentCandle.low = Math.min(currentCandle.low, bar.low);
        currentCandle.close = bar.close;
      }
    }

    // 最後一根（正在形成的）
    if (currentCandle) {
      // 檢查這根K棒是否完整
      const lastBarTime = typeof data[upToIndex]?.time === 'number'
        ? data[upToIndex].time
        : new Date(data[upToIndex]?.time).getTime() / 1000;
      const periodStart = Math.floor(lastBarTime / (minutes * SOURCE_MINUTES * 60)) * (minutes * SOURCE_MINUTES * 60);
      const periodEnd = periodStart + minutes * SOURCE_MINUTES * 60;

      // 如果還有下一根1分K，且下一根也在同一週期內，說明這根大K棒還沒完成
      const nextBar = data[upToIndex + 1];
      const nextBarTime = nextBar
        ? (typeof nextBar.time === 'number' ? nextBar.time : new Date(nextBar.time).getTime() / 1000)
        : null;

      if (nextBarTime && nextBarTime < periodEnd) {
        // 這根大K棒還在形成中
        setFormingCandle(currentCandle);
      } else {
        // 這根大K棒已完成
        candles.push(currentCandle);
        setFormingCandle(null);
      }
    }

    setDisplayCandles(candles);
  }, []);

  // 同步 ref
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);
  useEffect(() => { startDateRef.current = startDate; }, [startDate]);
  useEffect(() => { timeframeRef.current = timeframe; }, [timeframe]);
  useEffect(() => { initialBalanceRef.current = initialBalance; }, [initialBalance]);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('auth_token');
    return token
      ? { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
      : { 'Content-Type': 'application/json' };
  };

  // 自動存單筆交易
  const saveTrade = useCallback(async (trade) => {
    if (!currentUserRef.current || !currentSessionIdRef.current) return;
    try {
      await fetch('http://localhost:5001/api/trades', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          session_id: currentSessionIdRef.current,
          trade_type: trade.type,
          lot_size: trade.lotSize,
          entry_price: trade.entryPrice,
          close_price: trade.closePrice,
          pnl: trade.pnl,
          status: trade.status === 'cancelled' ? 'cancelled' : 'closed',
          close_reason: trade.closeReason || null,
          open_time: trade.openTime || null,
          close_time: trade.closeTime,
        })
      });
    } catch (e) { console.error('saveTrade error:', e); }
  }, []);

  // 自動更新 session 餘額
  const updateSessionBalance = useCallback(async (bal) => {
    if (!currentUserRef.current || !currentSessionIdRef.current) return;
    try {
      await fetch(`http://localhost:5001/api/sessions/${currentSessionIdRef.current}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ final_balance: bal })
      });
    } catch (e) {}
  }, []);

  // 檢查登入狀態
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (!token) return;
        const response = await fetch('http://localhost:5001/api/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const result = await response.json();
        if (result.status === 'success') {
          setCurrentUser(result.user);
          setShowAuth(false);
        } else {
          localStorage.removeItem('auth_token');
        }
      } catch (err) {
        console.log('未登入');
      }
    };
    checkAuth();
  }, []);

  // 同步 minuteData / minuteIndex 到 ref，讓 timeframe useEffect 讀到最新值
  useEffect(() => { minuteDataRef.current = minuteData; }, [minuteData]);
  useEffect(() => { minuteIndexRef.current = minuteIndex; }, [minuteIndex]);

  // 新交易產生時自動存到後端
  useEffect(() => {
    const newLength = tradeHistory.length;
    const prevLength = prevTradeHistoryLengthRef.current;
    if (newLength > prevLength) {
      for (let i = 0; i < newLength - prevLength; i++) {
        saveTrade(tradeHistory[i]);
      }
    }
    prevTradeHistoryLengthRef.current = newLength;
  }, [tradeHistory, saveTrade]);

  // 餘額變動時自動更新 session
  useEffect(() => {
    updateSessionBalance(balance);
  }, [balance, updateSessionBalance]);

  // 初始載入
  useEffect(() => {
    loadMinuteData(startDate);
  }, []);

  // 時間週期改變時，重新合成K棒（只依賴 timeframe，避免換日期時用到舊 minuteIndex）
  useEffect(() => {
    if (minuteDataRef.current.length > 0) {
      buildDisplayCandles(minuteDataRef.current, minuteIndexRef.current, timeframe);
    }
  }, [timeframe, buildDisplayCandles]);

  // 播放邏輯
  useEffect(() => {
    if (!isPlaying || minuteData.length === 0) return;

    const intervalMs = simulationMode ? (200 / speed) : (1000 / speed);

    const interval = setInterval(() => {
      setMinuteIndex(prev => {
        if (prev >= minuteData.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        const next = prev + 1;
        // 剩下 2000 筆時背景預載下一段
        if (minuteData.length - next < 2000) {
          loadNextChunk(minuteData);
        }
        buildDisplayCandles(minuteData, next, timeframe);
        return next;
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isPlaying, minuteData, speed, timeframe, simulationMode, buildDisplayCandles, loadNextChunk]);

  // 止損止盈檢查
  useEffect(() => {
    if (positions.length === 0 || !minuteData[minuteIndex]) return;

    const currentBar = minuteData[minuteIndex];
    const currentPrice = currentBar.close;
    const high = currentBar.high;
    const low = currentBar.low;

    let hasChanges = false;
    const updatedPositions = positions.map(pos => {
      // 預掛單觸發
      if (pos.status === 'pending') {
        let shouldTrigger = false;
        if (pos.type === 'buy') {
          // Buy Stop（掛單價 > 進場時市價）：等價格漲上去
          // Buy Limit（掛單價 < 進場時市價）：等價格跌下來
          if (pos.orderSubType === 'buy_stop') {
            shouldTrigger = high >= pos.entryPrice;
          } else {
            shouldTrigger = low <= pos.entryPrice;
          }
          if (shouldTrigger) console.log(`📈 BUY 預掛單觸發 @ ${pos.entryPrice}`);
        } else if (pos.type === 'sell') {
          // Sell Stop（掛單價 < 進場時市價）：等價格跌下去
          // Sell Limit（掛單價 > 進場時市價）：等價格漲上來
          if (pos.orderSubType === 'sell_stop') {
            shouldTrigger = low <= pos.entryPrice;
          } else {
            shouldTrigger = high >= pos.entryPrice;
          }
          if (shouldTrigger) console.log(`📉 SELL 預掛單觸發 @ ${pos.entryPrice}`);
        }
        if (shouldTrigger) {
          hasChanges = true;
          return { ...pos, status: 'open', triggerTime: currentBar.time, wasTriggered: true };
        }
      }

      // 止損止盈
      if (pos.status === 'open') {
        let closeReason = null;
        let closeAtPrice = null;

        if (pos.type === 'buy') {
          if (pos.stopLoss && low <= pos.stopLoss) {
            closeReason = '止損';
            closeAtPrice = pos.stopLoss;
          } else if (pos.takeProfit && high >= pos.takeProfit) {
            closeReason = '止盈';
            closeAtPrice = pos.takeProfit;
          }
        } else {
          if (pos.stopLoss && high >= pos.stopLoss) {
            closeReason = '止損';
            closeAtPrice = pos.stopLoss;
          } else if (pos.takeProfit && low <= pos.takeProfit) {
            closeReason = '止盈';
            closeAtPrice = pos.takeProfit;
          }
        }

        if (closeReason) {
          hasChanges = true;
          const pnl = pos.type === 'buy'
            ? (closeAtPrice - pos.entryPrice) * pos.lotSize * 100
            : (pos.entryPrice - closeAtPrice) * pos.lotSize * 100;

          console.log(`🔔 ${pos.type.toUpperCase()} ${closeReason} @ ${closeAtPrice}，盈虧: ${pnl.toFixed(2)}`);

          setTradeHistory(prev => [{
            id: Date.now() + Math.random(),
            openTime: new Date((pos.triggerTime ?? currentBar.time) * 1000).toISOString(),
            closeTime: new Date(currentBar.time * 1000).toISOString(),
            type: pos.type,
            lotSize: pos.lotSize,
            entryPrice: pos.entryPrice,
            closePrice: closeAtPrice,
            pnl,
            status: pnl >= 0 ? 'profit' : 'loss',
            closeReason,
          }, ...prev]);

          setBalance(prev => prev + pnl);
          return null;
        }
      }

      return pos;
    }).filter(p => p !== null);

    if (hasChanges) {
      setPositions(updatedPositions);
    }
  }, [minuteIndex, minuteData, positions]);

  // 控制函數
  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  const handleStepForward = () => {
    if (minuteIndex < minuteData.length - 1) {
      const next = minuteIndex + 1;
      setMinuteIndex(next);
      buildDisplayCandles(minuteData, next, timeframe);
    }
  };

  const handleStepBackward = () => {
    if (minuteIndex > 0) {
      const prev = minuteIndex - 1;
      setMinuteIndex(prev);
      buildDisplayCandles(minuteData, prev, timeframe);
    }
  };

  const handleDateChange = async (date) => {
    setStartDate(date);
    setIsPlaying(false);
    setPositions([]);
    setTradeHistory([]);
    setBalance(initialBalance);
    setCurrentSessionId(null);
    currentSessionIdRef.current = null;
    prevTradeHistoryLengthRef.current = 0;
    await loadMinuteData(date);
  };

  const handleAddPosition = (positionData) => {
    const newPosition = {
      id: Date.now(),
      ...positionData,
      triggerTime: null,
    };
    setPositions(prev => [...prev, newPosition]);
    console.log(`📝 新增持倉:`, newPosition);
  };

  const handleUpdatePosition = (positionId, updates) => {
    setPositions(prev =>
      prev.map(p => p.id === positionId ? { ...p, ...updates } : p)
    );
  };

  const handleClosePosition = (positionId, closeAmount) => {
    const pos = positions.find(p => p.id === positionId);
    if (!pos) return;

    const currentBar = minuteData[minuteIndex];
    // 預掛單取消不計算盈虧，只有已開倉訂單才用市價結算
    const closePrice = (pos.status === 'pending') ? pos.entryPrice : (currentBar?.close || pos.entryPrice);
    const pnl = (pos.status === 'pending') ? 0 : (pos.type === 'buy'
      ? (closePrice - pos.entryPrice) * closeAmount * 100
      : (pos.entryPrice - closePrice) * closeAmount * 100);

    setTradeHistory(prev => [{
      id: Date.now(),
      openTime: new Date((pos.triggerTime ?? currentBar?.time ?? 0) * 1000).toISOString(),
      closeTime: new Date((currentBar?.time ?? 0) * 1000).toISOString(),
      type: pos.type,
      lotSize: closeAmount,
      entryPrice: pos.entryPrice,
      closePrice: pos.status === 'pending' ? null : (pos.type === 'buy'
        ? pos.entryPrice + (pnl / (closeAmount * 100))
        : pos.entryPrice - (pnl / (closeAmount * 100))),
      pnl,
      status: pos.status === 'pending' ? 'cancelled' : (pnl >= 0 ? 'profit' : 'loss'),
      closeReason: pos.status === 'pending' ? '取消' : '手動',
    }, ...prev]);

    if (pnl !== 0) {
      setBalance(b => b + pnl);
    }

    setPositions(prev => {
      if (closeAmount >= pos.lotSize) {
        return prev.filter(p => p.id !== positionId);
      }
      return prev.map(p => p.id === positionId
        ? { ...p, lotSize: parseFloat((p.lotSize - closeAmount).toFixed(2)) }
        : p
      );
    });
  };

  // 新增復盤
  const handleCreateSession = async () => {
    if (!newSessionNameInput.trim() || !currentUser) return;
    try {
      const res = await fetch('http://localhost:5001/api/sessions', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: newSessionNameInput.trim(),
          start_date: startDateRef.current,
          timeframe: timeframeRef.current,
          initial_balance: initialBalanceRef.current
        })
      });
      const result = await res.json();
      if (result.status === 'success') {
        const newId = result.session.id;
        currentSessionIdRef.current = newId;
        setCurrentSessionId(newId);
        setActiveSessionName(newSessionNameInput.trim());
        setNewSessionNameInput('');
        setShowNewSession(false);
        // 把建立前已有的交易記錄也存進去
        if (tradeHistory.length > 0) {
          await fetch('http://localhost:5001/api/trades/batch', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({ session_id: newId, trades: tradeHistory })
          });
        }
        setTradeHistory([]);
        setBalance(initialBalance);
        setPositions([]);
        prevTradeHistoryLengthRef.current = 0;
      }
    } catch (e) { console.error('建立復盤失敗:', e); }
  };

  // 繼續舊的復盤 session
  const handleResumeSession = (session, trades) => {
    currentSessionIdRef.current = session.id;
    setCurrentSessionId(session.id);
    setActiveSessionName(session.name);
    // 還原餘額
    const restoredBalance = session.final_balance ?? session.initial_balance ?? initialBalance;
    setBalance(restoredBalance);
    if (session.initial_balance) setInitialBalance(session.initial_balance);
    // 把後端格式轉成前端格式
    const restored = trades.map(t => ({
      id: t.id,
      closeTime: t.close_time,
      type: t.trade_type,
      lotSize: t.lot_size,
      entryPrice: t.entry_price,
      closePrice: t.close_price,
      pnl: t.pnl ?? 0,
      status: t.status,
      closeReason: t.close_reason,
    }));
    setTradeHistory(restored);
    prevTradeHistoryLengthRef.current = restored.length;
    setPositions([]);
    setShowSessionHistory(false);
  };

  // 登入處理
  const handleLogin = (user) => {
    setCurrentUser(user);
    setShowAuth(false);
  };

  // 登出處理
  const handleLogout = async () => {
    try {
      await fetch('http://localhost:5001/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
    } catch (err) {
      console.error('登出失敗:', err);
    }
    localStorage.removeItem('auth_token');
    setCurrentUser(null);
    setShowAuth(true);
    setCurrentSessionId(null);
    currentSessionIdRef.current = null;
    setActiveSessionName(null);
    setTradeHistory([]);
    setBalance(initialBalance);
    setPositions([]);
    prevTradeHistoryLengthRef.current = 0;
  };


  // 合併顯示的K棒（已完成 + 正在形成）
  const chartDisplayData = formingCandle
    ? [...displayCandles, formingCandle]
    : displayCandles;

  // 當前價格
  const currentPrice = minuteData[minuteIndex]?.close || 0;

  return (
    <div className="app">
      <div className="header">
        <h1>XAUUSD 復盤系統</h1>
        <Controls
          isPlaying={isPlaying}
          onPlay={handlePlay}
          onPause={handlePause}
          onStepForward={handleStepForward}
          onStepBackward={handleStepBackward}
          onSpeedChange={setSpeed}
          onDateChange={handleDateChange}
          onTimeframeChange={setTimeframe}
          canStepForward={minuteIndex < minuteData.length - 1}
          canStepBackward={minuteIndex > 0}
          speed={speed}
          timeframe={timeframe}
          simulationMode={simulationMode}
          onSimulationModeChange={setSimulationMode}
          startDate={startDate}
        />
      </div>

      <div className="main-content">
        <Charts
          data={chartDisplayData}
          positions={positions}
          visibleBars={VISIBLE_BARS}
          timeframe={timeframe}
          reversalSignals={reversalSignals}
        />
      </div>

      <TradingPanel
        balance={balance}
        initialBalance={initialBalance}
        onInitialBalanceChange={(val) => { setInitialBalance(val); setBalance(val); }}
        positions={positions}
        onAddPosition={handleAddPosition}
        onUpdatePosition={handleUpdatePosition}
        onClosePosition={handleClosePosition}
        currentPrice={currentPrice}
        isVisible={showTradingPanel}
        onClose={() => setShowTradingPanel(false)}
      />

      {!showTradingPanel && (
        <button className="open-trading-btn" onClick={() => setShowTradingPanel(true)}>
          交易面板
        </button>
      )}

      <TradeHistory
        tradeHistory={tradeHistory}
        isVisible={showTradeHistory}
        onClose={() => setShowTradeHistory(false)}
      />

      {!showTradeHistory && (
        <button className="open-history-btn" onClick={() => setShowTradeHistory(true)}>
          交易記錄 {tradeHistory.length > 0 && `(${tradeHistory.length})`}
        </button>
      )}

      {/* 用戶資訊區 */}
      <div className="user-area">
        {currentUser ? (
          <>
            <span className="user-name">{currentUser.username}</span>
            {activeSessionName && (
              <span className="active-session-name">{activeSessionName}</span>
            )}
            <button className="user-btn" onClick={() => setShowNewSession(true)}>新增復盤</button>
            <button className="user-btn" onClick={() => setShowSessionHistory(true)}>查看記錄</button>
            <button className="user-btn logout" onClick={handleLogout}>登出</button>
          </>
        ) : (
          <button className="user-btn login" onClick={() => setShowAuth(true)}>登入</button>
        )}
      </div>

      {/* 登入面板 */}
      {showAuth && !currentUser && (
        <AuthPanel onLogin={handleLogin} />
      )}

      {/* 查看復盤記錄 */}
      <SessionHistory
        isVisible={showSessionHistory}
        onClose={() => setShowSessionHistory(false)}
        onLoadSession={handleResumeSession}
        currentUser={currentUser}
      />

      {/* 新增復盤 modal */}
      {showNewSession && (
        <div className="new-session-overlay" onClick={() => setShowNewSession(false)}>
          <div className="new-session-modal" onClick={e => e.stopPropagation()}>
            <h3>新增復盤</h3>
            <input
              type="text"
              value={newSessionNameInput}
              onChange={e => setNewSessionNameInput(e.target.value)}
              placeholder="輸入復盤名稱，例：12月復盤"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') handleCreateSession(); if (e.key === 'Escape') setShowNewSession(false); }}
            />
            <div className="modal-buttons">
              <button className="modal-btn confirm" onClick={handleCreateSession}>開始</button>
              <button className="modal-btn cancel" onClick={() => setShowNewSession(false)}>取消</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default App;
