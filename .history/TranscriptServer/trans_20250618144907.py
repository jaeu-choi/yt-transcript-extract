from youtube_transcript_api import YouTubeTranscriptApi

def format_timestamp(start_time):
    """
    초 단위 시간을 [분:초] 형태로 변환하는 함수
    
    :param start_time: 시작 시간 (초 단위, float)
    :return: [분:초] 형태의 문자열
    """
    minutes = int(start_time // 60)
    seconds = int(start_time % 60)
    return f"[{minutes}:{seconds:02d}]"

def get_available_languages(video_id):
    """
    유튜브 영상에서 사용 가능한 자막 언어 목록을 가져오는 함수.
    
    :param video_id: 유튜브 영상 ID (문자열)
    :return: 사용 가능한 언어 목록 (성공 시) 또는 오류 메시지 (실패 시)
    """
    try:
        # 모든 사용 가능한 자막 목록 가져오기
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        
        available_languages = []
        other_languages = []
        
        for transcript in transcript_list:
            lang_code = transcript.language_code
            lang_name = transcript.language
            is_generated = transcript.is_generated
            
            lang_info = {
                'code': lang_code,
                'name': lang_name,
                'is_generated': is_generated,
                'display_name': f"{lang_name} ({'자동생성' if is_generated else '수동'})"
            }
            
            # 한국어, 영어는 우선순위로 앞에 배치
            if lang_code in ['ko', 'en']:
                available_languages.append(lang_info)
            else:
                other_languages.append(lang_info)
        
        # 한국어, 영어를 앞에 두고 나머지 언어들을 뒤에 추가
        available_languages.extend(other_languages)
        
        return available_languages, None
        
    except Exception as e:
        print(f"언어 목록 가져오기 오류: {e}")
        return None, str(e)

def download_subtitles_by_language(video_id, language_code, file_format="txt", video_title=None):
    """
    특정 언어의 유튜브 영상 자막을 가져와 파일로 저장하는 함수.

    :param video_id: 유튜브 영상 ID (문자열)
    :param language_code: 언어 코드 ('ko', 'en' 등)
    :param file_format: 저장할 파일 형식 ("txt" 또는 "srt")
    :param video_title: 비디오 제목
    :return: 저장된 파일 이름 (성공 시) 또는 오류 메시지 (실패 시)
    """
    try:
        # 특정 언어의 자막 가져오기
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=[language_code])
        
        # 파일 내용 생성
        if file_format == "txt":
            # 영상 제목 포함
            title_line = f'제목: "{video_title}"\n\n'
            
            # 타임스탬프와 함께 자막 내용 생성
            subtitle_lines = [
                f"{format_timestamp(line['start'])} {line['text']}" 
                for line in transcript_list
            ]
            
            file_content = title_line + "\n".join(subtitle_lines)
            file_name = f"{video_title}_{language_code}_subtitles.txt"

        elif file_format == "srt":
            file_content = "\n\n".join([
                f"{i+1}\n{line['start']} --> {line['start'] + line.get('duration', 0)}\n{line['text']}"
                for i, line in enumerate(transcript_list)
            ])
            file_name = f"{video_id}_{language_code}_subtitles.srt"

        else:
            return None, "지원되지 않는 파일 형식입니다. 'txt' 또는 'srt'를 선택하세요."
        
        return file_name, file_content  # 저장된 파일 이름 반환

    except Exception as e:
        print(f"자막 다운로드 오류: {e}")
        return None, str(e)

def download_subtitles(video_id, file_format="txt", video_title=None):
    """
    기존 함수 - 하위 호환성 유지 (한국어 > 영어 우선순위)
    """
    try:
        # 유튜브 자막 가져오기 (한국어, 영어 우선)
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=['ko', 'en'])
        
        # 파일 내용 생성
        if file_format == "txt":
            # 영상 제목 포함
            title_line = f'제목: "{video_title}"\n\n'
            
            # 타임스탬프와 함께 자막 내용 생성
            subtitle_lines = [
                f"{format_timestamp(line['start'])} {line['text']}" 
                for line in transcript_list
            ]
            
            file_content = title_line + "\n".join(subtitle_lines)
            file_name = f"{video_title}_subtitles.txt"

        elif file_format == "srt":
            file_content = "\n\n".join([
                f"{i+1}\n{line['start']} --> {line['start'] + line.get('duration', 0)}\n{line['text']}"
                for i, line in enumerate(transcript_list)
            ])
            file_name = f"{video_id}_subtitles.srt"

        else:
            return "지원되지 않는 파일 형식입니다. 'txt' 또는 'srt'를 선택하세요."
        
        return file_name, file_content  # 저장된 파일 이름 반환

    except Exception as e:
        print(f"오류 발생: {e}")
        return None, str(e)  # 오류 메시지 반환