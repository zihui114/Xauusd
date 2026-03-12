from flask import Flask, jsonify, request
from flask_cors import CORS
import pandas as pd
from datetime import datetime
import os
import secrets
from functools import wraps

from database import db, User, ReplaySession, Trade

app = Flask(__name__)
app.secret_key = 'xauusd-replay-secret-key-2025'

CORS(app, origins='*')

# 資料庫配置
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(os.path.dirname(__file__), 'xauusd.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db.init_app(app)

# 創建資料表
with app.app_context():
    db.create_all()
    print("✅ 資料庫初始化完成")

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

    if User.query.filter_by(username=username).first():
        return jsonify({'status': 'error', 'message': '帳號已存在'}), 400

    user = User(username=username)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()

    return jsonify({'status': 'success', 'message': '註冊成功', 'user': user.to_dict()})


@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '')

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({'status': 'error', 'message': '帳號或密碼錯誤'}), 401

    token = secrets.token_hex(32)
    active_tokens[token] = user.id

    return jsonify({'status': 'success', 'message': '登入成功', 'user': user.to_dict(), 'token': token})


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

    user = User.query.get(user_id)
    if not user:
        return jsonify({'status': 'error', 'message': '用戶不存在'}), 401

    return jsonify({'status': 'success', 'user': user.to_dict()})


# ========== 復盤記錄 API ==========
@app.route('/api/sessions', methods=['GET'])
@login_required
def get_sessions():
    user_id = get_user_id_from_token()
    sessions = ReplaySession.query.filter_by(user_id=user_id).order_by(ReplaySession.updated_at.desc()).all()
    return jsonify({'status': 'success', 'sessions': [s.to_dict() for s in sessions]})


@app.route('/api/sessions', methods=['POST'])
@login_required
def create_session():
    user_id = get_user_id_from_token()
    data = request.json

    new_session = ReplaySession(
        user_id=user_id,
        name=data.get('name', f"復盤 {datetime.now().strftime('%Y-%m-%d %H:%M')}"),
        start_date=data.get('start_date', '2025-12-01'),
        timeframe=data.get('timeframe', '1h'),
        initial_balance=data.get('initial_balance', 10000)
    )
    db.session.add(new_session)
    db.session.commit()

    return jsonify({'status': 'success', 'session': new_session.to_dict()})


@app.route('/api/sessions/<int:session_id>', methods=['GET'])
@login_required
def get_session(session_id):
    user_id = get_user_id_from_token()
    replay_session = ReplaySession.query.filter_by(id=session_id, user_id=user_id).first()
    if not replay_session:
        return jsonify({'status': 'error', 'message': '記錄不存在'}), 404

    return jsonify({
        'status': 'success',
        'session': replay_session.to_dict(),
        'trades': [t.to_dict() for t in replay_session.trades]
    })


@app.route('/api/sessions/<int:session_id>', methods=['PUT'])
@login_required
def update_session(session_id):
    user_id = get_user_id_from_token()
    replay_session = ReplaySession.query.filter_by(id=session_id, user_id=user_id).first()
    if not replay_session:
        return jsonify({'status': 'error', 'message': '記錄不存在'}), 404

    data = request.json
    if 'name' in data:
        replay_session.name = data['name']
    if 'final_balance' in data:
        replay_session.final_balance = data['final_balance']

    db.session.commit()
    return jsonify({'status': 'success', 'session': replay_session.to_dict()})


@app.route('/api/sessions/<int:session_id>', methods=['DELETE'])
@login_required
def delete_session(session_id):
    user_id = get_user_id_from_token()
    replay_session = ReplaySession.query.filter_by(id=session_id, user_id=user_id).first()
    if not replay_session:
        return jsonify({'status': 'error', 'message': '記錄不存在'}), 404

    Trade.query.filter_by(session_id=session_id).delete()
    db.session.delete(replay_session)
    db.session.commit()
    return jsonify({'status': 'success', 'message': '已刪除'})


# ========== 交易記錄 API ==========
@app.route('/api/trades', methods=['GET'])
@login_required
def get_trades():
    user_id = get_user_id_from_token()
    session_id = request.args.get('session_id', type=int)

    query = Trade.query.filter_by(user_id=user_id)
    if session_id:
        query = query.filter_by(session_id=session_id)

    trades = query.order_by(Trade.created_at.desc()).all()
    return jsonify({'status': 'success', 'trades': [t.to_dict() for t in trades]})


@app.route('/api/trades', methods=['POST'])
@login_required
def create_trade():
    user_id = get_user_id_from_token()
    data = request.json

    trade = Trade(
        user_id=user_id,
        session_id=data.get('session_id'),
        trade_type=data.get('trade_type'),
        lot_size=data.get('lot_size'),
        entry_price=data.get('entry_price'),
        close_price=data.get('close_price'),
        stop_loss=data.get('stop_loss'),
        take_profit=data.get('take_profit'),
        pnl=data.get('pnl'),
        status=data.get('status', 'open'),
        close_reason=data.get('close_reason'),
        open_time=datetime.fromisoformat(data['open_time']) if data.get('open_time') else None,
        close_time=datetime.fromisoformat(data['close_time']) if data.get('close_time') else None
    )
    db.session.add(trade)
    db.session.commit()

    return jsonify({'status': 'success', 'trade': trade.to_dict()})


@app.route('/api/trades/batch', methods=['POST'])
@login_required
def create_trades_batch():
    user_id = get_user_id_from_token()
    data = request.json
    trades_data = data.get('trades', [])
    session_id = data.get('session_id')

    created_trades = []
    for t in trades_data:
        trade = Trade(
            user_id=user_id,
            session_id=session_id,
            trade_type=t.get('trade_type') or t.get('type'),
            lot_size=t.get('lot_size') or t.get('lotSize'),
            entry_price=t.get('entry_price') or t.get('entryPrice'),
            close_price=t.get('close_price') or t.get('closePrice'),
            stop_loss=t.get('stop_loss') or t.get('stopLoss'),
            take_profit=t.get('take_profit') or t.get('takeProfit'),
            pnl=t.get('pnl'),
            status=t.get('status', 'closed'),
            close_reason=t.get('close_reason') or t.get('closeReason')
        )
        db.session.add(trade)
        created_trades.append(trade)

    db.session.commit()
    return jsonify({'status': 'success', 'count': len(created_trades)})


@app.route('/api/stats', methods=['GET'])
@login_required
def get_stats():
    user_id = get_user_id_from_token()
    trades = Trade.query.filter_by(user_id=user_id).filter(Trade.pnl != None).all()
    total = len(trades)
    wins = len([t for t in trades if t.pnl > 0])
    losses = len([t for t in trades if t.pnl < 0])
    total_pnl = sum(t.pnl for t in trades)
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
            df['time'] = df['Date'].astype('int64') // 10**9

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
