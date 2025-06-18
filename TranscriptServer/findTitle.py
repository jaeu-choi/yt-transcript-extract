import requests
import re
import emoji
from bs4 import BeautifulSoup

def sanitize_filename(title, max_length=100):
    """
    유튜브 제목에서 특수문자 및 이모지를 제거하여 안전한 파일명 생성.

    :param title: 원본 유튜브 영상 제목
    :param max_length: 최대 파일명 길이 (기본값: 100자)
    :return: 안전한 파일명
    """
    # 1️⃣ 유튜브 제목에서 특수문자 제거 (파일명으로 사용할 수 없는 문자)
    title = re.sub(r'[\\/*?:"<>|]', '_', title)

    # 2️⃣ 이모지 제거
    title = emoji.replace_emoji(title, replace='')

    # 3️⃣ 공백 정리 (연속된 공백을 하나로 변경)
    title = re.sub(r'\s+', ' ', title).strip()

    # 4️⃣ 파일명 길이 제한 (너무 긴 제목 방지)
    if len(title) > max_length:
        title = title[:max_length].rstrip('_')

    return title

def get_youtube_title_scraping(video_url):
    """
    유튜브 영상 제목을 스크래핑하여 가져오고, 안전한 파일명으로 변환.

    :param video_url: 유튜브 영상 URL
    :return: 안전한 유튜브 제목
    """
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    }
    
    response = requests.get(video_url, headers=headers)

    if response.status_code == 200:
        soup = BeautifulSoup(response.text, "html.parser")
        title = soup.find("title")
        
        if title:
            raw_title = title.text.replace(' - YouTube', '').strip()
            safe_title = sanitize_filename(raw_title)  # 안전한 파일명으로 변환
            return safe_title
        else:
            return "영상 제목을 찾을 수 없습니다."
    else:
        return f"요청 실패 (상태 코드: {response.status_code})"
