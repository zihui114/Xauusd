import { useState, useRef, useEffect } from 'react';
import './TradeHistory.css';

function TradeHistory({ tradeHistory, isVisible, onClose }) {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef(null);

  const handleMouseDown = (e) => {
    if (e.target.closest('.panel-close-btn')) return;
    setIsDragging(true);
    setDragOffset({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({ x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y });
    };
    const handleMouseUp = () => setIsDragging(false);
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  if (!isVisible) return null;

  // 依日期分組，插入每日小計列（tradeHistory 是最新在前）
  const getDateLabel = (closeTime) => {
    const d = new Date(closeTime);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  const renderItems = [];
  let lastDateLabel = null;
  for (const trade of tradeHistory) {
    const dateLabel = getDateLabel(trade.closeTime);
    if (dateLabel !== lastDateLabel) {
      const dayTrades = tradeHistory.filter(
        t => getDateLabel(t.closeTime) === dateLabel && t.status !== 'cancelled'
      );
      const dayPnl = dayTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
      renderItems.push({ type: 'header', dateLabel, dayPnl });
      lastDateLabel = dateLabel;
    }
    renderItems.push({ type: 'trade', trade });
  }

  return (
    <div
      className="trade-history-panel"
      ref={panelRef}
      style={{ left: position.x, top: position.y }}
    >
      <div className="panel-header" onMouseDown={handleMouseDown}>
        <span className="panel-title">交易記錄</span>
        <button className="panel-close-btn" onClick={onClose}>×</button>
      </div>

      <div className="history-table-container">
        <table className="history-table">
          <thead>
            <tr>
              <th>圖表時間</th>
              <th>類型</th>
              <th>手數</th>
              <th>進場價</th>
              <th>平倉價</th>
              <th>盈虧</th>
              <th>原因</th>
            </tr>
          </thead>
          <tbody>
            {tradeHistory.length === 0 ? (
              <tr><td colSpan="7" className="empty-cell">暫無交易記錄</td></tr>
            ) : (
              renderItems.map((item, idx) => {
                if (item.type === 'header') {
                  return (
                    <tr key={`day-${item.dateLabel}-${idx}`} className="day-summary-row">
                      <td colSpan="7">
                        <span className="day-label">{item.dateLabel}</span>
                        <span className={`day-pnl ${item.dayPnl >= 0 ? 'positive' : 'negative'}`}>
                          {item.dayPnl >= 0 ? '+' : ''}{item.dayPnl.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  );
                }
                const trade = item.trade;
                return (
                  <tr key={trade.id} className={trade.status}>
                    <td className="time-cell">
                      {new Date(trade.closeTime).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className={`type-cell ${trade.type}`}>
                      {trade.type === 'buy' ? 'BUY' : 'SELL'}
                    </td>
                    <td>{trade.lotSize}</td>
                    <td>{trade.entryPrice?.toFixed(2) ?? '-'}</td>
                    <td>{trade.closePrice?.toFixed(2) ?? '-'}</td>
                    <td className={`pnl-cell ${trade.pnl >= 0 ? 'positive' : 'negative'}`}>
                      {trade.status === 'cancelled' ? '-' : `${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}`}
                    </td>
                    <td className="reason-cell">{trade.closeReason ?? '-'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default TradeHistory;
