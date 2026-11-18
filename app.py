import hashlib
import hmac
import logging
import os

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, session
from google import genai

# .env 파일에서 환경변수(GEMINI_API_KEY, APP_PASSWORD 등)를 불러옵니다.
load_dotenv()

app = Flask(__name__)

# Vercel 등 서버리스 환경에서도 로그인 쿠키가 유지되도록 비밀번호 기반으로 고정 서명키를 생성합니다.
_raw_secret = os.getenv("FLASK_SECRET_KEY", "").strip() or os.getenv("APP_PASSWORD", "").strip() or "dev-fallback-secret"
app.secret_key = hashlib.sha256(f"usw-doc-draft:{_raw_secret}".encode("utf-8")).hexdigest()
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

# 서버 콘솔에 오류 로그를 남기기 위한 기본 설정입니다.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

MODEL_NAME = "gemini-3.5-flash-lite"
MIN_PASSWORD_LENGTH = 8

ALLOWED_DOC_TYPES = {
    "보도자료",
    "안내문",
    "기안문",
    "결과 보고",
    "업무 메일",
}


def get_app_password() -> str:
    """환경변수에서 사이트 접속 비밀번호를 읽어옵니다."""
    return os.getenv("APP_PASSWORD", "").strip()


def is_password_configured() -> bool:
    """접속 비밀번호가 8자리 이상으로 올바르게 설정되었는지 확인합니다."""
    return len(get_app_password()) >= MIN_PASSWORD_LENGTH


def is_authenticated() -> bool:
    """현재 사용자가 비밀번호 인증을 완료했는지 확인합니다."""
    return bool(session.get("authenticated"))


def format_input_facts(data: dict) -> str:
    """사용자가 입력한 항목을 프롬프트에 넣기 좋은 텍스트로 정리합니다."""
    facts = data.get("facts") or {}
    lines = [
        f"- 문서 종류: {data['doc_type']}",
        f"- 제목: {data['title']}",
        f"- 받는 사람: {data.get('recipient') or '(입력 없음)'}",
        f"- 어조: {data.get('tone') or '공식적'}",
        f"- 일시: {facts.get('date_time') or '(입력 없음)'}",
        f"- 장소: {facts.get('location') or '(입력 없음)'}",
        f"- 대상: {facts.get('target') or '(입력 없음)'}",
        f"- 신청 방법: {facts.get('how_to_apply') or '(입력 없음)'}",
        f"- 문의처: {facts.get('contact') or '(입력 없음)'}",
    ]
    return "\n".join(lines)


def build_prompt(data: dict) -> str:
    """Prompt A 또는 Prompt B 규칙에 맞춰 Gemini에게 보낼 요청문을 만듭니다."""
    prompt_type = (data.get("prompt_type") or "A").strip().upper()
    info_block = format_input_facts(data)

    if prompt_type == "B":
        return (
            "당신은 대학 행정 업무 문서 작성 전문가입니다.\n"
            "아래 [입력 정보]를 바탕으로 대학 행정 문서 초안을 마크다운(Markdown) 형식으로 작성해 주세요.\n\n"
            "[필수 준수 규칙]\n"
            "1. 대학 행정 문서 체크리스트 적용:\n"
            "   - 6하원칙(누가, 언제, 어디서, 무엇을, 어떻게, 왜)이 빠짐없이 드러나는지 점검하세요.\n"
            "   - 정중한 공식 행정 문체를 기본으로 하되, 요청된 어조를 반영하세요.\n"
            "   - 문의처 안내를 반드시 포함하세요.\n"
            "2. 절대 지어내기 금지:\n"
            "   - [입력 정보]에 없거나 '(입력 없음)'으로 표시된 내용은 절대 임의로 지어내거나 추측해서 채우지 말고,\n"
            "     반드시 `[확인 필요]`로 표시하세요.\n\n"
            "[입력 정보]\n"
            f"{info_block}\n"
        )

    # Prompt A: 입력 정보로 해당 문서를 써 달라고만 간단히 요청
    return (
        "아래 입력 정보를 바탕으로 해당 종류의 업무 문서 초안을 작성해 주세요.\n\n"
        f"{info_block}\n"
    )


@app.route("/", methods=["GET"])
def index():
    """메인 웹 화면을 보여줍니다."""
    return render_template(
        "index.html",
        authenticated=is_authenticated(),
        password_configured=is_password_configured(),
    )


@app.route("/sw.js", methods=["GET"])
def service_worker():
    """PWA 서비스 워커를 루트 경로(/sw.js)에서 제공합니다."""
    return app.send_static_file("sw.js")


@app.route("/api/login", methods=["POST"])
def login():
    """접속 비밀번호를 확인하고 세션을 인증합니다."""
    if not is_password_configured():
        logger.error("APP_PASSWORD 환경변수가 없거나 8자리 미만입니다.")
        return (
            jsonify(
                {
                    "error": (
                        "서버에 8자리 이상의 접속 비밀번호(APP_PASSWORD)가 설정되지 않았습니다. "
                        ".env 또는 Vercel 환경변수를 확인해 주세요."
                    )
                }
            ),
            500,
        )

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "올바른 요청 형식이 아닙니다."}), 400

    entered = (data.get("password") or "").strip()
    if len(entered) < MIN_PASSWORD_LENGTH:
        return jsonify({"error": "비밀번호는 8자리 이상 입력해 주세요."}), 400

    expected = get_app_password()
    if not hmac.compare_digest(entered, expected):
        return jsonify({"error": "비밀번호가 올바르지 않습니다. 다시 확인해 주세요."}), 401

    session["authenticated"] = True
    return jsonify({"ok": True}), 200


@app.route("/api/logout", methods=["POST"])
def logout():
    """현재 브라우저의 인증 세션을 잠급니다."""
    session.pop("authenticated", None)
    return jsonify({"ok": True}), 200


@app.route("/api/generate", methods=["POST"])
def generate_draft():
    """입력값을 검증하고 Gemini API를 호출해 문서 초안을 반환합니다."""
    if not is_authenticated():
        return (
            jsonify({"error": "접속 비밀번호 인증이 필요합니다. 비밀번호를 먼저 입력해 주세요."}),
            401,
        )

    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        return jsonify({"error": "올바른 요청 형식이 아닙니다. 다시 시도해 주세요."}), 400

    doc_type = (data.get("doc_type") or "").strip()
    title = (data.get("title") or "").strip()

    # 서버 측 필수 입력 검증
    if not doc_type or not title:
        return (
            jsonify({"error": "문서 종류와 제목은 필수 입력 항목입니다. 빠진 내용을 채워 주세요."}),
            400,
        )

    if doc_type not in ALLOWED_DOC_TYPES:
        return (
            jsonify({"error": "지원하지 않는 문서 종류입니다. 목록에서 선택해 주세요."}),
            400,
        )

    facts = data.get("facts") or {}
    cleaned_data = {
        "doc_type": doc_type,
        "title": title,
        "recipient": (data.get("recipient") or "").strip(),
        "tone": (data.get("tone") or "공식적").strip(),
        "prompt_type": (data.get("prompt_type") or "A").strip().upper(),
        "facts": {
            "date_time": (facts.get("date_time") or "").strip(),
            "location": (facts.get("location") or "").strip(),
            "target": (facts.get("target") or "").strip(),
            "how_to_apply": (facts.get("how_to_apply") or "").strip(),
            "contact": (facts.get("contact") or "").strip(),
        },
    }

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        logger.error("GEMINI_API_KEY 환경변수가 설정되어 있지 않습니다.")
        return (
            jsonify(
                {
                    "error": (
                        "AI 연결 열쇠(GEMINI_API_KEY)가 설정되지 않았습니다. "
                        ".env 파일에 API 키가 올바르게 들어 있는지 확인해 주세요."
                    )
                }
            ),
            500,
        )

    prompt = build_prompt(cleaned_data)

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
        )
        draft_text = (response.text or "").strip()
        if not draft_text:
            logger.warning("Gemini 응답 텍스트가 비어 있습니다.")
            return (
                jsonify({"error": "초안이 비어 있습니다. 입력 내용을 조금 더 자세히 적고 다시 시도해 주세요."}),
                502,
            )
        return jsonify({"draft": draft_text}), 200
    except Exception:
        # API 키가 로그에 노출되지 않도록 예외 메시지만 주의하여 기록합니다.
        logger.exception("Gemini API 호출 중 오류가 발생했습니다.")
        return (
            jsonify(
                {
                    "error": (
                        "문서 초안을 생성하는 중에 문제가 발생했습니다. "
                        "잠시 후 다시 시도하거나, 인터넷 연결과 API 키 상태를 확인해 주세요."
                    )
                }
            ),
            500,
        )


if __name__ == "__main__":
    app.run(debug=True, host="127.0.0.1", port=5000)
