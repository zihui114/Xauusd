import { useState, useEffect } from 'react';
import './SessionHistory.css';

function SessionHistory({ isVisible, onClose, onLoadSession, currentUser }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState(null);
  const [sessionTrades, setSessionTrades] = useState([]);

  // 載入復盤記錄列表
  const loadSessions = async () => {
    if (!currentUser) return;
    setLoading(true);
    try {
      const response = await fetch('http://localhost:5001/api/sessions', {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      });
      const result = await response.json();
      if (result.status === 'success') {
        setSessions(result.sessions);
      }
    } catch (err) {
      console.error('載入記錄失敗:', err);
    }
    setLoading(false);
  };

  // 載入單一復盤記錄的詳細資料
  const loadSessionDetail = async (sessionId) => {
    try {
      const response = await fetch(`http://localhost:5001/api/sessions/${sessionId}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      });
      const result = await response.json();
      if (result.status === 'success') {
        setSelectedSession(result.session);
        setSessionTrades(result.trades);
        return { session: result.session, trades: result.trades };
      }
    } catch (err) {
      console.error('載入詳細記錄失敗:', err);
    }
    return null;
  };

  // 刪除復盤記錄
  const deleteSession = async (sessionId) => {
    if (!confirm('確定要刪除此復盤記錄？')) return;

    try {
      const response = await fetch(`http://localhost:5001/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${localStorage.getItem('auth_token')}` }
      });
      const result = await response.json();
      if (result.status === 'success') {
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (selectedSession?.id === sessionId) {
          setSelectedSession(null);
          setSessionTrades([]);
        }
      }
    } catch (err) {
      console.error('刪除失敗:', err);
    }
  };

  useEffect(() => {
    if (isVisible) {
      loadSessions();
    }
  }, [isVisible, currentUser]);

  if (!isVisible) return null;

  // 計算統計數據
  const calculateStats = (trades) => {
    const closedTrades = trades.filter(t => t.status === 'closed' || t.pnl !== null);
    const totalPnL = closedTrades.reduce((sum, t) => sum + (t.pnl || 0), 0);
    const winTrades = closedTrades.filter(t => t.pnl > 0);
    const loseTrades = closedTrades.filter(t => t.pnl < 0);
    const winRate = closedTrades.length > 0 ? (winTrades.length / closedTrades.length * 100).toFixed(1) : 0;

    return { totalPnL, winTrades: winTrades.length, loseTrades: loseTrades.length, winRate, total: closedTrades.length };
  };

  return (
    <div className="session-history-overlay" onClick={onClose}>
      <div className="session-history-panel" onClick={e => e.stopPropagation()}>
        <div className="panel-header">
          <h2>復盤記錄</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="panel-content">
          {/* 左側：記錄列表 */}
          <div className="sessions-list">
            <h3>歷史記錄</h3>
            {loading ? (
              <div className="loading">載入中...</div>
            ) : sessions.length === 0 ? (
              <div className="empty">尚無復盤記錄</div>
            ) : (
              <ul>
                {sessions.map(session => (
                  <li
                    key={session.id}
                    className={selectedSession?.id === session.id ? 'selected' : ''}
                    onClick={() => loadSessionDetail(session.id)}
                  >
                    <div className="session-name">{session.name}</div>
                    <div className="session-meta">
                      <span>復盤日期 {session.start_date}</span>
                      <span>{session.timeframe}</span>
                      <span>{session.trade_count} 筆交易</span>
                    </div>
                    <div className="session-actions">
                      <button
                        className="resume-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          loadSessionDetail(session.id).then((data) => {
                            if (data && onLoadSession) onLoadSession(data.session, data.trades);
                          });
                        }}
                      >
                        繼續
                      </button>
                      <button
                        className="delete-btn"
                        onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                      >
                        刪除
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 右側：詳細資料 */}
          <div className="session-detail">
            {selectedSession ? (
              <>
                <h3>{selectedSession.name}</h3>
                <div className="session-meta-line">
                  <span>復盤日期：{selectedSession.start_date}</span>
                  <span>{selectedSession.timeframe}</span>
                </div>

                {sessionTrades.length > 0 && (() => {
                  const stats = calculateStats(sessionTrades);
                  return (
                    <div className="stats-inline">
                      <span>{stats.total} 筆</span>
                      <span className={stats.totalPnL >= 0 ? 'positive' : 'negative'}>
                        {stats.totalPnL >= 0 ? '+' : ''}{stats.totalPnL.toFixed(2)}
                      </span>
                      <span>勝率 {stats.winRate}%</span>
                      <span className="positive">{stats.winTrades} 勝</span>
                      <span className="negative">{stats.loseTrades} 敗</span>
                      <span className="session-meta-line">
                        本金 ${selectedSession.initial_balance?.toFixed(0)}
                        {selectedSession.initial_balance != null && ` · 最終 $${(selectedSession.initial_balance + stats.totalPnL).toFixed(0)}`}
                      </span>
                    </div>
                  );
                })()}

                <div className="trades-list">
                  {sessionTrades.length === 0 ? (
                    <div className="empty">尚無交易記錄</div>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>日期</th>
                          <th>類型</th>
                          <th>手數</th>
                          <th>進場</th>
                          <th>出場</th>
                          <th>盈虧</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sessionTrades.map(trade => {
                          const dateStr = trade.close_time
                            ? (() => {
                                const d = new Date(trade.close_time);
                                return `${d.getMonth() + 1}/${d.getDate()}`;
                              })()
                            : '-';
                          return (
                          <tr key={trade.id}>
                            <td className="trade-date">{dateStr}</td>
                            <td className={trade.trade_type}>{trade.trade_type?.toUpperCase()}</td>
                            <td>{trade.lot_size}</td>
                            <td>{trade.entry_price?.toFixed(2)}</td>
                            <td>{trade.close_price?.toFixed(2) || '-'}</td>
                            <td className={trade.pnl >= 0 ? 'positive' : 'negative'}>
                              {trade.pnl != null ? (trade.pnl >= 0 ? '+' : '') + trade.pnl.toFixed(2) : '-'}
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            ) : (
              <div className="no-selection">
                <p>選擇左側的復盤記錄查看詳情</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SessionHistory;
