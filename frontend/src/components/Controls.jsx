import { useState, useEffect } from 'react';
import './Controls.css';

// 時間週期配置
const TIMEFRAMES = [
  { key: '1w', label: 'W1' },
  { key: '1d', label: 'D1' },
  { key: '4h', label: 'H4' },
  { key: '1h', label: 'H1' },
  { key: '30m', label: 'M30' },
  { key: '15m', label: 'M15' },
  { key: '5m', label: 'M5' },
];

function Controls({
  isPlaying,
  onPlay,
  onPause,
  onStepForward,
  onStepBackward,
  onSpeedChange,
  onDateChange,
  onTimeframeChange,
  canStepForward,
  canStepBackward,
  speed,
  timeframe,
  simulationMode,
  onSimulationModeChange,
  startDate = '2025-08-20',
  hasOpenPositions = false,
}) {
  const [selectedDate, setSelectedDate] = useState(startDate);

  // 當外部 startDate prop 改變時（如載入歷史 Session），同步更新
  useEffect(() => {
    setSelectedDate(startDate);
  }, [startDate]);

  const handleDateLoad = () => {
    if (!selectedDate || !onDateChange) return;
    if (hasOpenPositions && !window.confirm('目前有未平倉的持倉，載入新日期會將其全部平倉，確定繼續？')) return;
    onDateChange(selectedDate);
  };

  return (
    <div className="controls">
      <div className="timeframe-control">
        {TIMEFRAMES.map(tf => (
          <button
            key={tf.key}
            className={`timeframe-btn ${timeframe === tf.key ? 'active' : ''}`}
            onClick={() => onTimeframeChange(tf.key)}
          >
            {tf.label}
          </button>
        ))}
      </div>

      <div className="control-divider"></div>

      <div className="date-control">
        <label>開始日期:</label>
        <input
          type="date"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="date-input"
        />
        <button
          onClick={handleDateLoad}
          className="control-btn load-btn"
          disabled={!selectedDate}
        >
          <span className="label">載入</span>
        </button>
      </div>

      <div className="control-divider"></div>
      <button 
        onClick={onStepBackward} 
        disabled={isPlaying || !canStepBackward}
        className="control-btn"
        title="後退一根K棒"
      >
        <span className="icon">⏮</span>
        <span className="label">後退</span>
      </button>
      
      {!isPlaying ? (
        <button 
          onClick={onPlay} 
          className="control-btn play-btn"
          disabled={!canStepForward}
          title="開始播放"
        >
          <span className="icon">▶</span>
          <span className="label">播放</span>
        </button>
      ) : (
        <button 
          onClick={onPause} 
          className="control-btn pause-btn"
          title="暫停播放"
        >
          <span className="icon">⏸</span>
          <span className="label">暫停</span>
        </button>
      )}
      
      <button 
        onClick={onStepForward} 
        disabled={isPlaying || !canStepForward}
        className="control-btn"
        title="前進一根K棒"
      >
        <span className="icon">⏭</span>
        <span className="label">前進</span>
      </button>

      <div className="speed-control">
        <label>速度:</label>
        <select
          onChange={(e) => onSpeedChange(parseFloat(e.target.value))}
          value={speed || 1}
        >
          <option value="0.5">0.5x</option>
          <option value="1">1x</option>
          <option value="2">2x</option>
          <option value="3">3x</option>
          <option value="4">4x</option>
          <option value="5">5x</option>
          <option value="10">10x</option>
        </select>
      </div>

      <div className="control-divider"></div>

      <button
        className={`control-btn simulation-btn ${simulationMode ? 'active' : ''}`}
        onClick={() => onSimulationModeChange && onSimulationModeChange(!simulationMode)}
        title={simulationMode ? '模擬模式：開啟（逐步顯示K棒形成過程）' : '模擬模式：關閉（直接顯示完整K棒）'}
      >
        <span className="icon">{simulationMode ? '🎬' : '⏩'}</span>
        <span className="label">{simulationMode ? '模擬' : '快進'}</span>
      </button>
    </div>
  );
}

export default Controls;