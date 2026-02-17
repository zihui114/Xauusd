import { useState } from 'react';
import './AuthPanel.css';

function AuthPanel({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // 驗證
    if (!username || !password) {
      setError('請填寫帳號和密碼');
      setLoading(false);
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError('兩次密碼不一致');
      setLoading(false);
      return;
    }

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const response = await fetch(`http://localhost:5001${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      const result = await response.json();

      if (result.status === 'success') {
        if (!isLogin) {
          // 註冊成功後自動登入
          const loginResponse = await fetch('http://localhost:5001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
          });
          const loginResult = await loginResponse.json();
          if (loginResult.status === 'success') {
            onLogin(loginResult.user);
          }
        } else {
          onLogin(result.user);
        }
      } else {
        setError(result.message || '操作失敗');
      }
    } catch (err) {
      setError('連線失敗，請確認後端是否啟動');
    }

    setLoading(false);
  };

  return (
    <div className="auth-overlay">
      <div className="auth-panel">
        <h2>{isLogin ? '登入' : '註冊'}</h2>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>帳號</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="請輸入帳號"
              autoFocus
            />
          </div>

          <div className="form-group">
            <label>密碼</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="請輸入密碼"
            />
          </div>

          {!isLogin && (
            <div className="form-group">
              <label>確認密碼</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="請再次輸入密碼"
              />
            </div>
          )}

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? '處理中...' : (isLogin ? '登入' : '註冊')}
          </button>
        </form>

        <div className="switch-mode">
          {isLogin ? (
            <span>還沒有帳號？<button onClick={() => { setIsLogin(false); setError(''); }}>註冊</button></span>
          ) : (
            <span>已有帳號？<button onClick={() => { setIsLogin(true); setError(''); }}>登入</button></span>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthPanel;
