import { useState, useRef, useEffect } from 'react';
import './TradeHistory.css';

function TradeHistory({ tradeHistory, isVisible, onClose }) {
  const [position, setPosition] = useState({ x: 100, y: 100 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const panelRef = useRef(null);

  // 開始拖曳
  const handleMouseDown = (e) => {
    if (e.target.closest('.panel-close-btn')) return;
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  };

  // 拖曳中
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDragging) return;
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // 計算統計數據
  const stats = tradeHistory.reduce((acc, trade) => {
    if (trade.status === 'cancelled') {
      acc.cancelled++;
    } else if (trade.status === 'profit') {
      acc.wins++;
      acc.totalProfit += trade.pnl;
    } else {
      acc.losses++;
      acc.totalLoss += trade.pnl;
    }
    acc.totalPnL += trade.pnl;
    return acc;
  }, { wins: 0, losses: 0, cancelled: 0, totalProfit: 0, totalLoss: 0, totalPnL: 0 });

  const winRate = stats.wins + stats.losses > 0
    ? ((stats.wins / (stats.wins + stats.losses)) * 100).toFixed(1)
    : 0;

  if (!isVisible) return null;

  return (
    <div
      className="trade-history-panel"
      ref={panelRef}
      style={{
        left: position.x,
        top: position.y,
      }}
    >
      {/* 標題列 */}
      <div className="panel-header" onMouseDown={handleMouseDown}>
        <span className="panel-title">交易記錄</span>
        <button className="panel-close-btn" onClick={onClose}>×</button>
      </div>

      {/* 統計摘要 */}
      <div className="stats-summary">
        <div className="stat-item">
          <span className="stat-label">總交易</span>
          <span className="stat-value">{tradeHistory.length}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">勝率</span>
          <span className="stat-value">{winRate}%</span>
        </div>
        <div className="stat-item win">
          <span className="stat-label">獲利</span>
          <span className="stat-value">{stats.wins} 筆</span>
        </div>
        <div className="stat-item loss">
          <span className="stat-label">虧損</span>
          <span className="stat-value">{stats.losses} 筆</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">取消</span>
          <span className="stat-value">{stats.cancelled} 筆</span>
        </div>
        <div className={`stat-item total ${stats.totalPnL >= 0 ? 'profit' : 'loss'}`}>
          <span className="stat-label">總盈虧</span>
          <span className="stat-value">
            {stats.totalPnL >= 0 ? '+' : ''}{stats.totalPnL.toFixed(2)}
          </span>
        </div>
      </div>

      {/* 交易記錄表格 */}
      <div className="history-table-container">
        <table className="history-table">
          <thead>
            <tr>
              <th>時間</th>
              <th>類型</th>
              <th>手數</th>
              <th>進場價</th>
              <th>平倉價</th>
              <th>盈虧</th>
              <th>狀態</th>
            </tr>
          </thead>
          <tbody>
            {tradeHistory.length === 0 ? (
              <tr className="empty-row">
                <td colSpan="7">暫無交易記錄</td>
              </tr>
            ) : (
              tradeHistory.map(trade => {
                const closeTime = new Date(trade.closeTime).toLocaleString('zh-TW', {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <tr key={trade.id} className={trade.status}>
                    <td className="time-cell">{closeTime}</td>
                    <td>
                      <span className={`type-badge ${trade.type}`}>
                        {trade.type === 'buy' ? 'BUY' : 'SELL'}
                      </span>
                    </td>
                    <td>{trade.lotSize}</td>
                    <td>{trade.entryPrice?.toFixed(2) || '-'}</td>
                    <td>{trade.closePrice?.toFixed(2) || '-'}</td>
                    <td className={`pnl-cell ${trade.pnl >= 0 ? 'positive' : 'negative'}`}>
                      {trade.status === 'cancelled' ? '-' :
                        `${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)}`}
                    </td>
                    <td>
                      <span className={`status-badge ${trade.status}`}>
                        {trade.status === 'profit' ? '獲利' :
                         trade.status === 'loss' ? '虧損' : '取消'}
                        {trade.closeReason && ` (${trade.closeReason})`}
                      </span>
                    </td>
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
