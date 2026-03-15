from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
from datetime import datetime
import os
import secrets
from functools import wraps

from database import User, ReplaySession, Trade

app = Flask(__name__)
app.secret_key = 'xauusd-replay-secret-key-2025'

CORS(app, origins='*')

print("✅ MongoDB Atlas 連接成功")

# k棒歷史數據
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data', 'archive')

# 可用的時間周期
TIMEFRAMES = {
    '1m': 'XAU_1m_data.csv',
    '5m': 'XAU_5m_data.csv',
    '15m': 'XAU_15m_data.csv',
    '30m': 'XAU_30m_data.csv',
    '1h': 'XAU_1h_data.csv',
    '4h': 'XAU_4h_data.csv',
    '1d': 'XAU_1d_data.csv',
    '1w': 'XAU_1w_data.csv',
    '1M': 'XAU_1Month_data.csv',
}

# Token 儲存（記憶體，重啟後失效）
active_tokens = {}


# ========== Kaggle 資料下載 ==========
def download_kaggle_data():
    """首次啟動時自動從 Kaggle 下載資料"""
    # 檢查是否已有資料（檢查 1m 檔案）
    if os.path.exists(os.path.join(DATA_DIR, TIMEFRAMES['1m'])):
        print("✅ 本地資料已存在，跳過下載")
        return

    print("📥 本地無資料，開始從 Kaggle 下載...")
    try:
        import kagglehub
        from kagglehub import KaggleDatasetAdapter

        # 下載資料集到本地
        dataset_path = kagglehub.dataset_download(
            "novandraanugrah/xauusd-gold-price-historical-data-2004-2024"
        )
        print(f"📦 資料集已下載到: {dataset_path}")

        # 建立資料目錄
        os.makedirs(DATA_DIR, exist_ok=True)

        # 複製所有時間週期的檔案到資料目錄
        import shutil
        for timeframe, filename in TIMEFRAMES.items():
            src = os.path.join(dataset_path, filename)
            dst = os.path.join(DATA_DIR, filename)
            if os.path.exists(src):
                shutil.copy2(src, dst)
                print(f"✅ {filename} 已複製")

        print("🎉 所有資料檔案下載完成！")

    except ImportError:
        print("❌ 請先安裝 kagglehub: pip install kagglehub")
    except Exception as e:
        print(f"❌ 下載失敗: {e}")
        print("💡 請手動下載資料集並放入 data/archive/ 目錄")


# 啟動時檢查並下載資料
download_kaggle_data()


# ========== Token 驗證 ==========
def get_user_id_from_token():
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        token = auth[7:]
        return active_tokens.get(token)
    return None


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user_id = get_user_id_from_token()
        if not user_id:
            return jsonify({'status': 'error', 'message': '請先登入'}), 401
        return f(*args, **kwargs)
    return decorated_function


# ========== 用戶認證 API ==========
@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')

    if not username or not password:
        return jsonify({'status': 'error', 'message': '帳號和密碼不能為空'}), 400

    if User.find_by_username(username):
        return jsonify({'status': 'error', 'message': '帳號已存在'}), 400

    user = User.create(username, password)
    return jsonify({'status': 'success', 'message': '註冊成功', 'user': User.to_dict(user)})


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')

    user = User.find_by_username(username)
    if not user or not User.check_password(user, password):
        return jsonify({'status': 'error', 'message': '帳號或密碼錯誤'}), 401

    token = secrets.token_hex(32)
    active_tokens[token] = str(user['_id'])

    return jsonify({'status': 'success', 'message': '登入成功', 'user': User.to_dict(user), 'token': token})


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        token = auth[7:]
        active_tokens.pop(token, None)
    return jsonify({'status': 'success', 'message': '已登出'})


@app.route('/api/auth/me', methods=['GET'])
def get_current_user():
    user_id = get_user_id_from_token()
    if not user_id:
        return jsonify({'status': 'error', 'message': '未登入'}), 401

    user = User.find_by_id(user_id)
    if not user:
        return jsonify({'status': 'error', 'message': '用戶不存在'}), 401

    return jsonify({'status': 'success', 'user': User.to_dict(user)})


# ========== 復盤記錄 API ==========
@app.route('/api/sessions', methods=['GET'])
@login_required
def get_sessions():
    user_id = get_user_id_from_token()
    sessions_list = ReplaySession.find_by_user(user_id)
    return jsonify({'status': 'success', 'sessions': [ReplaySession.to_dict(s) for s in sessions_list]})


@app.route('/api/sessions', methods=['POST'])
@login_required
def create_session():
    user_id = get_user_id_from_token()
    data = request.json

    new_session = ReplaySession.create(
        user_id=user_id,
        name=data.get('name', f"復盤 {datetime.now().strftime('%Y-%m-%d %H:%M')}"),
        start_date=data.get('start_date', '2025-12-01'),
        timeframe=data.get('timeframe', '1h'),
        initial_balance=data.get('initial_balance', 10000)
    )

    return jsonify({'status': 'success', 'session': ReplaySession.to_dict(new_session)})


@app.route('/api/sessions/<session_id>', methods=['GET'])
@login_required
def get_session(session_id):
    user_id = get_user_id_from_token()
    replay_session = ReplaySession.find_by_id(session_id, user_id)
    if not replay_session:
        return jsonify({'status': 'error', 'message': '記錄不存在'}), 404

    trades_list = Trade.find_by_session(session_id)
    return jsonify({
        'status': 'success',
        'session': ReplaySession.to_dict(replay_session),
        'trades': [Trade.to_dict(t) for t in trades_list]
    })


@app.route('/api/sessions/<session_id>', methods=['PUT'])
@login_required
def update_session(session_id):
    user_id = get_user_id_from_token()
    replay_session = ReplaySession.find_by_id(session_id, user_id)
    if not replay_session:
        return jsonify({'status': 'error', 'message': '記錄不存在'}), 404

    data = request.json
    updates = {}
    if 'name' in data:
        updates['name'] = data['name']
    if 'final_balance' in data:
        updates['final_balance'] = data['final_balance']

    updated_session = ReplaySession.update(session_id, user_id, updates)
    return jsonify({'status': 'success', 'session': ReplaySession.to_dict(updated_session)})


@app.route('/api/sessions/<session_id>', methods=['DELETE'])
@login_required
def delete_session(session_id):
    user_id = get_user_id_from_token()
    replay_session = ReplaySession.find_by_id(session_id, user_id)
    if not replay_session:
        return jsonify({'status': 'error', 'message': '記錄不存在'}), 404

    ReplaySession.delete(session_id, user_id)
    return jsonify({'status': 'success', 'message': '已刪除'})


# ========== 交易記錄 API ==========
@app.route('/api/trades', methods=['GET'])
@login_required
def get_trades():
    user_id = get_user_id_from_token()
    session_id = request.args.get('session_id')

    trades_list = Trade.find_by_user(user_id, session_id)
    return jsonify({'status': 'success', 'trades': [Trade.to_dict(t) for t in trades_list]})


@app.route('/api/trades', methods=['POST'])
@login_required
def create_trade():
    user_id = get_user_id_from_token()
    data = request.json

    trade = Trade.create(user_id, data.get('session_id'), data)
    return jsonify({'status': 'success', 'trade': Trade.to_dict(trade)})


@app.route('/api/trades/batch', methods=['POST'])
@login_required
def create_trades_batch():
    user_id = get_user_id_from_token()
    data = request.json
    trades_data = data.get('trades', [])
    session_id = data.get('session_id')

    created_trades = []
    for t in trades_data:
        trade_data = {
            'trade_type': t.get('trade_type') or t.get('type'),
            'lot_size': t.get('lot_size') or t.get('lotSize'),
            'entry_price': t.get('entry_price') or t.get('entryPrice'),
            'close_price': t.get('close_price') or t.get('closePrice'),
            'stop_loss': t.get('stop_loss') or t.get('stopLoss'),
            'take_profit': t.get('take_profit') or t.get('takeProfit'),
            'pnl': t.get('pnl'),
            'status': t.get('status', 'closed'),
            'close_reason': t.get('close_reason') or t.get('closeReason')
        }
        trade = Trade.create(user_id, session_id, trade_data)
        created_trades.append(trade)

    return jsonify({'status': 'success', 'count': len(created_trades)})


@app.route('/api/stats', methods=['GET'])
@login_required
def get_stats():
    user_id = get_user_id_from_token()
    trades_list = Trade.find_by_user(user_id)
    trades_with_pnl = [t for t in trades_list if t.get('pnl') is not None]

    total = len(trades_with_pnl)
    wins = len([t for t in trades_with_pnl if t.get('pnl', 0) > 0])
    losses = len([t for t in trades_with_pnl if t.get('pnl', 0) < 0])
    total_pnl = sum(t.get('pnl', 0) for t in trades_with_pnl)

    return jsonify({
        'status': 'success',
        'stats': {
            'total_trades': total,
            'wins': wins,
            'losses': losses,
            'win_rate': round(wins / total * 100, 1) if total > 0 else 0,
            'total_pnl': round(total_pnl, 2),
        }
    })


# ========== K線數據 API ==========
def load_data(timeframe='1d', start_date=None, end_date=None, limit=1000):
    try:
        filename = TIMEFRAMES.get(timeframe, 'XAU_1d_data.csv')
        filepath = os.path.join(DATA_DIR, filename)

        if not os.path.exists(filepath):
            print(f"文件不存在: {filepath}")
            return []

        df = pd.read_csv(filepath, sep=';')
        df['Date'] = pd.to_datetime(df['Date'], format='%Y.%m.%d %H:%M')

        if start_date:
            start_dt = pd.to_datetime(start_date)
            df = df[df['Date'] >= start_dt]
        if end_date:
            end_dt = pd.to_datetime(end_date)
            df = df[df['Date'] <= end_dt]

        if limit and len(df) > limit:
            if start_date:
                df = df.head(limit)
            else:
                df = df.tail(limit)

        if timeframe in ['1d', '1w', '1M']:
            df['time'] = df['Date'].dt.strftime('%Y-%m-%d')
        else:
            # pandas datetime64 是微秒精度，除以 10^6 轉成秒
            df['time'] = df['Date'].astype('int64') // 10**6

        result_df = df[['time', 'Open', 'High', 'Low', 'Close']].copy()
        result_df.columns = ['time', 'open', 'high', 'low', 'close']

        return result_df.to_dict('records')

    except Exception as e:
        print(f"載入數據錯誤: {e}")
        return []


@app.route('/api/kline', methods=['GET'])
def get_kline():
    timeframe = request.args.get('timeframe', '1d')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    limit = request.args.get('limit', 1000, type=int)

    data = load_data(timeframe, start_date, end_date, limit)
    return jsonify({'status': 'success', 'timeframe': timeframe, 'count': len(data), 'data': data})


@app.route('/api/timeframes', methods=['GET'])
def get_timeframes():
    return jsonify({'status': 'success', 'timeframes': list(TIMEFRAMES.keys())})


if __name__ == '__main__':
    print("🚀 Flask 後端啟動中...")
    print(f"📂 數據目錄: {DATA_DIR}")
    print(f"📊 可用時間周期: {', '.join(TIMEFRAMES.keys())}")
    app.run(debug=True, port=5001)
