import os
import re
import socket
import sys
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import trans  # trans.py를 import
import findTitle

# UTF-8 인코딩 설정
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')

# 현재 디렉토리를 Python 경로에 추가
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

app = Flask(__name__)
# 모든 라우트에 CORS 적용
CORS(app, resources={r"/*": {"origins": "*"}})

def find_free_port(start_port=5000, max_port=5100):
    """사용 가능한 포트를 찾는 함수"""
    for port in range(start_port, max_port):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise OSError(f"No free port found in range {start_port}-{max_port}")

@app.route('/health', methods=['GET'])
def health_check():
    """서버 상태 확인용 엔드포인트"""
    print("[DEBUG] Health check called", flush=True)
    return jsonify({"status": "ok", "message": "Server is running"}), 200

@app.route('/get-languages', methods=['POST'])
def get_available_languages():
    """사용 가능한 자막 언어 목록을 가져오는 엔드포인트"""
    try:
        data = request.json
        target_url = data.get('target_url')
        
        print(f"[DEBUG] Getting languages for: {target_url}", flush=True)
        
        if not target_url:
            print("Error: No URL provided", flush=True)
            return jsonify({"error": "No URL provided"}), 400

        # 정규표현식으로 video_id 추출
        match = re.search(r"v=([^&]+)", target_url)
        if not match:
            print("Error: Invalid YouTube URL (no video ID found)", flush=True)
            return jsonify({"error": "Invalid YouTube URL"}), 400

        video_id = match.group(1)
        print(f"Extracted Video ID: {video_id}", flush=True)

        # 사용 가능한 언어 목록 가져오기
        languages, error = trans.get_available_languages(video_id)
        
        if error:
            print(f"Error getting languages: {error}", flush=True)
            return jsonify({"error": f"Failed to get available languages: {error}"}), 500
            
        if not languages:
            print("No Korean or English subtitles available", flush=True)
            return jsonify({"error": "No Korean or English subtitles available"}), 404
            
        print(f"Available languages: {languages}", flush=True)
        return jsonify({"languages": languages}), 200
        
    except Exception as e:
        print(f"Unhandled exception in get_languages: {e}", flush=True)
        return jsonify({"error": f"Unhandled server error: {str(e)}"}), 500

@app.route('/submit-url', methods=['POST'])
def receive_url():
    try:
        data = request.json
        target_url = data.get('target_url')
        response_format = data.get('format', 'json')
        language_code = data.get('language_code')  # 새로 추가된 파라미터
        
        print(f"[DEBUG] Received request: {target_url}, language: {language_code}", flush=True)
        
        if not target_url:
            print("Error: No URL provided", flush=True)
            return jsonify({"error": "No URL provided"}), 400

        # URL 수신 로그
        print(f"Received URL: {target_url}", flush=True)
        
        # 유튜브 제목 스크래핑
        try:
            video_title = findTitle.get_youtube_title_scraping(target_url)
            print(f"Extracted Video Title: {video_title}", flush=True)
        except Exception as e:
            print(f"Error in get_youtube_title_scraping: {e}", flush=True)
            return jsonify({"error": "Failed to get video title"}), 500

        # 정규표현식으로 video_id 추출
        match = re.search(r"v=([^&]+)", target_url)
        if not match:
            print("Error: Invalid YouTube URL (no video ID found)", flush=True)
            return jsonify({"error": "Invalid YouTube URL"}), 400

        video_id = match.group(1)
        print(f"Extracted Video ID: {video_id}", flush=True)

        # 자막 다운로드 - 언어 코드가 지정된 경우와 아닌 경우 분기
        try:
            if language_code:
                # 특정 언어로 자막 다운로드
                fileName, sub = trans.download_subtitles_by_language(
                    video_id, 
                    language_code, 
                    file_format="txt", 
                    video_title=video_title
                )
                print(f"Downloaded subtitles for language {language_code}", flush=True)
            else:
                # 기존 방식 (한국어 > 영어 우선순위)
                fileName, sub = trans.download_subtitles(
                    video_id, 
                    file_format="txt", 
                    video_title=video_title
                )
                print(f"Downloaded subtitles with default priority", flush=True)
                
            if fileName is None:
                print(f"[ERROR] Subtitle download failed: {sub}", flush=True)
                return jsonify({"error": f"Subtitle extraction failed: {sub}"}), 500
                
            print(f"Downloaded subtitles successfully. Length: {len(sub)}", flush=True)
            
        except Exception as e:
            print(f"Error in download_subtitles: {e}", flush=True)
            return jsonify({"error": f"Failed to download subtitles: {str(e)}"}), 500

        # 응답 형식에 따른 반환
        if response_format == 'json':
            response_data = {
                "subTitles": sub,
                "language": language_code if language_code else "auto"
            }
            return jsonify(response_data), 200
        elif response_format == 'txt':
            return send_file(fileName, as_attachment=True)
        else:
            print("Error: Invalid response format", flush=True)
            return jsonify({"error": "Invalid Format"}), 400

    except Exception as e:
        print(f"Unhandled exception: {e}", flush=True)
        return jsonify({"error": f"Unhandled server error: {str(e)}"}), 500

if __name__ == '__main__':
    try:
        port = find_free_port()
        print(f"[INFO] Starting Flask on port {port}", flush=True)
        
        app.run(
            host='127.0.0.1',
            port=port,
            debug=False,
            use_reloader=False
        )
    except Exception as e:
        print(f"[ERROR] Failed to start Flask server: {e}", flush=True)
        sys.exit(1)