import { useState, useEffect, useCallback, useMemo } from 'react';
import Charts from './components/Charts';
import TradingPanel from './components/TradingPanel';
import TradeHistory from './components/TradeHistory';
import Controls from './components/Controls';
import AuthPanel from './components/AuthPanel';
import SessionHistory from './components/SessionHistory';
import './App.css';

function App() {
  const [balance, setBalance] = useState(10000);
  const [positions, setPositions] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeframe, setTimeframe] = useState('1h');
  const [startDate, setStartDate] = useState('2025-12-01');
  const [speed, setSpeed] = useState(1);
  const [showTradingPanel, setShowTradingPanel] = useState(false);
  const [showTradeHistory, setShowTradeHistory] = useState(false);

  // 用戶認證
  const [currentUser, setCurrentUser] = useState(null);
  const [showAuth, setShowAuth] = useState(true);
  const [showSessionHistory, setShowSessionHistory] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState(null);

  // 1分鐘數據（播放源）
  const [minuteData, setMinuteData] = useState([]);
  const [minuteIndex, setMinuteIndex] = useState(0);

  // 模擬模式
  const [simulationMode, setSimulationMode] = useState(true);

  // 合成的大週期K棒（用於顯示）
  const [displayCandles, setDisplayCandles] = useState([]);
  const [formingCandle, setFormingCandle] = useState(null); // 正在形成的K棒

  const VISIBLE_BARS = 100;

  // 時間週期對應的分鐘數（基於5分鐘數據源）
  const TIMEFRAME_MINUTES = {
    '5m': 1,      // 5分K = 1根5分鐘數據
    '15m': 3,     // 15分K = 3根5分鐘數據
    '30m': 6,     // 30分K = 6根5分鐘數據
    '1h': 12,     // 1小時K = 12根5分鐘數據
    '4h': 48,     // 4小時K = 48根5分鐘數據
    '1d': 288,    // 日K = 288根5分鐘數據
    '1w': 2016,   // 週K = 2016根5分鐘數據
  };

  const SOURCE_MINUTES = 5; // 數據源是5分鐘K

  // 訊號檢測時區配置
  const SIGNAL_TIMEFRAMES = {
    '5m': { minutes: 1, label: 'M5' },
    '15m': { minutes: 3, label: 'M15' },
    '30m': { minutes: 6, label: 'M30' },
    '1h': { minutes: 12, label: 'H1' },
    '4h': { minutes: 48, label: 'H4' },
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

      // 對每天檢測：逐根K棒檢查是否為「當時」的當天最高/最低
      Object.entries(dailyCandles).forEach(([, candles]) => {
        if (candles.length < 2) return;

        let currentDayHigh = -Infinity;
        let currentDayLow = Infinity;

        // 按時間順序遍歷每根K棒
        candles.forEach(candle => {
          // 檢查這根K棒是否創了當時的新高
          if (candle.high > currentDayHigh) {
            currentDayHigh = candle.high;
            // 如果有轉空形態，標記訊號
            if (isReversalCandle(candle, 'bearish')) {
              signals.push({
                time: candle.time,
                type: 'bearish',
                timeframe: config.label,
                price: candle.high,
              });
            }
          }

          // 檢查這根K棒是否創了當時的新低
          if (candle.low < currentDayLow) {
            currentDayLow = candle.low;
            // 如果有轉多形態，標記訊號
            if (isReversalCandle(candle, 'bullish')) {
              signals.push({
                time: candle.time,
                type: 'bullish',
                timeframe: config.label,
                price: candle.low,
              });
            }
          }
        });
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
      console.log('📊 載入5分鐘數據...');
      const response = await fetch(`http://localhost:5001/api/kline?timeframe=5m&limit=50000`);
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
          if (foundIndex !== -1 && foundIndex > 0) {
            initialIndex = foundIndex;
          } else {
            // 如果目標日期在數據範圍之外或是第一筆，顯示提示
            console.log(`⚠️ 目標日期 ${targetDate} 不在數據範圍內，使用數據起點`);
            // 設為一個能顯示足夠K棒的位置
            const minBars = TIMEFRAME_MINUTES[timeframe] * VISIBLE_BARS;
            initialIndex = Math.min(minBars, result.data.length - 1);
          }
        }

        // 顯示數據時間範圍
        const firstTime = new Date(result.data[0].time * 1000).toISOString().split('T')[0];
        const lastTime = new Date(result.data[result.data.length - 1].time * 1000).toISOString().split('T')[0];
        console.log(`📅 數據範圍: ${firstTime} ~ ${lastTime}`);

        setMinuteIndex(initialIndex);
        console.log(`✅ 載入 ${result.data.length} 筆5分鐘數據，起始索引: ${initialIndex}`);

        // 初始化顯示的K棒
        buildDisplayCandles(result.data, initialIndex, timeframe);
      }
    } catch (error) {
      console.error('❌ 載入1分鐘數據失敗:', error);
    }
  }, [timeframe]);

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

  // 檢查登入狀態
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const response = await fetch('http://localhost:5001/api/auth/me', {
          credentials: 'include'
        });
        const result = await response.json();
        if (result.status === 'success') {
          setCurrentUser(result.user);
          setShowAuth(false);
        }
      } catch (err) {
        console.log('未登入');
      }
    };
    checkAuth();
  }, []);

  // 初始載入
  useEffect(() => {
    loadMinuteData(startDate);
  }, []);

  // 時間週期改變時，重新合成K棒
  useEffect(() => {
    if (minuteData.length > 0) {
      buildDisplayCandles(minuteData, minuteIndex, timeframe);
    }
  }, [timeframe, minuteData, minuteIndex, buildDisplayCandles]);

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
        // 更新顯示的K棒
        buildDisplayCandles(minuteData, next, timeframe);
        return next;
      });
    }, intervalMs);

    return () => clearInterval(interval);
  }, [isPlaying, minuteData, speed, timeframe, simulationMode, buildDisplayCandles]);

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
        if (pos.type === 'buy' && low <= pos.entryPrice) {
          shouldTrigger = true;
          console.log(`📈 BUY 預掛單觸發 @ ${pos.entryPrice}`);
        } else if (pos.type === 'sell' && high >= pos.entryPrice) {
          shouldTrigger = true;
          console.log(`📉 SELL 預掛單觸發 @ ${pos.entryPrice}`);
        }
        if (shouldTrigger) {
          hasChanges = true;
          return { ...pos, status: 'open', triggerTime: currentBar.time };
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
            closeTime: new Date().toISOString(),
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
    await loadMinuteData(date);
  };

  const handleAddPosition = (positionData) => {
    const newPosition = {
      id: Date.now(),
      ...positionData,
      status: 'pending',
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
    const closePrice = currentBar?.close || pos.entryPrice;
    const pnl = pos.type === 'buy'
      ? (closePrice - pos.entryPrice) * closeAmount * 100
      : (pos.entryPrice - closePrice) * closeAmount * 100;

    setTradeHistory(prev => [{
      id: Date.now(),
      closeTime: new Date().toISOString(),
      type: pos.type,
      lotSize: closeAmount,
      entryPrice: pos.entryPrice,
      closePrice: pos.status === 'pending' ? null : (pos.type === 'buy'
        ? pos.entryPrice + (pnl / (closeAmount * 100))
        : pos.entryPrice - (pnl / (closeAmount * 100))),
      pnl,
      status: pos.status === 'pending' ? 'cancelled' : (pnl >= 0 ? 'profit' : 'loss'),
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
        credentials: 'include'
      });
    } catch (err) {
      console.error('登出失敗:', err);
    }
    setCurrentUser(null);
    setShowAuth(true);
    setCurrentSessionId(null);
  };

  // 保存復盤記錄
  const handleSaveSession = async () => {
    if (!currentUser) {
      alert('請先登入');
      return;
    }

    try {
      // 創建或更新復盤記錄
      let sessionId = currentSessionId;

      if (!sessionId) {
        // 創建新記錄
        const sessionName = prompt('請輸入復盤名稱:', `復盤 ${startDate}`);
        if (!sessionName) return;

        const response = await fetch('http://localhost:5001/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: sessionName,
            start_date: startDate,
            timeframe: timeframe,
            initial_balance: 10000
          })
        });
        const result = await response.json();
        if (result.status === 'success') {
          sessionId = result.session.id;
          setCurrentSessionId(sessionId);
        } else {
          alert('創建記錄失敗: ' + result.message);
          return;
        }
      }

      // 更新最終餘額
      await fetch(`http://localhost:5001/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ final_balance: balance })
      });

      // 保存交易記錄
      if (tradeHistory.length > 0) {
        await fetch('http://localhost:5001/api/trades/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            session_id: sessionId,
            trades: tradeHistory
          })
        });
      }

      alert('保存成功！');
    } catch (err) {
      console.error('保存失敗:', err);
      alert('保存失敗，請稍後再試');
    }
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
            <button className="user-btn" onClick={handleSaveSession}>保存記錄</button>
            <button className="user-btn" onClick={() => setShowSessionHistory(true)}>歷史記錄</button>
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

      {/* 復盤歷史記錄 */}
      <SessionHistory
        isVisible={showSessionHistory}
        onClose={() => setShowSessionHistory(false)}
        currentUser={currentUser}
      />

    </div>
  );
}

export default App;
