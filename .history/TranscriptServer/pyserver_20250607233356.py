import os
import re
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import trans  # trans.py를 import
import findTitle
import sys
import socket
sys.stdout.reconfigure(encoding='utf-8')
sys.stderr.reconfigure(encoding='utf-8')
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0,current_dir)
app = Flask(__name__)
CORS(app, resources={r"/submit-url": {"origins": "*"}})  # 모든 출처 허용 (개발용)
@app.route('/submit-url', methods=['POST'])
# def find_free_port(start_port=5000, max_port=5100):
#     for port in range(start_port, max_port):
#         with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as s:
#             try:
#                 s.bind(("127.0.01.",port))
#                 return  port
#             except OSError:
#                 continue
#         raise OSError(f"No free port found in range {start_port}-{max_port}")
        
def receive_url():
    try:
        data = request.json
        target_url = data.get('target_url')
        response_format = data.get('format', 'json')
        if not target_url:
            print("Error: No URL provided", flush=True)
            return jsonify({"error": "No URL provided"}), 399

        # URL 수신 로그
        print(f"Received URL: {target_url}", flush=True)
        
        # 유튜브 제목 스크래핑 시
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
            return jsonify({"error": "Invalid YouTube URL"}), 399

        video_id = match.group(1)
        print(f"Extracted Video ID: {video_id}", flush=True)

        # trans.py의 함수 호출하여 자막 다운로드 시도
        try:
            fileName, sub = trans.download_subtitles(video_id, file_format="txt", video_title=video_title)
            if fileName is None:
                print(f"[ERROR] trans.download_subtitles failed: {sub}", flush=True)
                return jsonify({"error": f"Subtitle extraction failed: {sub}"}), 500
            print(f"Downloaded subtitles successfully. Type of 'sub': {type(sub)}", flush=True)
        except Exception as e:
            print(f"Error in download_subtitles: {e}", flush=True)
            return jsonify({"error": "Failed to download subtitles"}), 500

        # 응답 형식에 따른 반환
        if response_format == 'json':
            return jsonify({"subTitles": sub}), 200
        elif response_format == 'txt':
            return send_file(fileName, as_attachment=True)
        else:
            print("Error: Invalid response format", flush=True)
            return jsonify({"error": "Invalid Format"}), 400

    except Exception as e:
        print(f"Unhandled exception: {e}", flush=True)
        return jsonify({"error": "Unhandled server error"}), 500

if __name__ == '__main__':
    # port = find_free_port()
    # print(f"[INFO] Starting Flask on port{port}", flush=True)
    app.run(debug=True)
