from youtube_transcript_api import YouTubeTranscriptApi
def download_subtitles(video_id, file_format="txt",video_title=None):
    """
    유튜브 영상의 자막을 가져와 파일로 저장하는 함수.

    :param video_id: 유튜브 영상 ID (문자열)
    :param file_format: 저장할 파일 형식 ("txt" 또는 "srt")
    :return: 저장된 파일 이름 (성공 시) 또는 오류 메시지 (실패 시)
    """
    try:
        # 유튜브 자막 가져오기 (한국어, 영어 우선)
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id, languages=['ko', 'en'])
        # 파일 내용 생성
        if file_format == "txt":
            file_content = "\n".join([line['text'] for line in transcript_list])
            file_name = f"{video_title}_subtitles.txt"

        elif file_format == "srt":
            file_content = "\n\n".join([
                f"{i+1}\n{line['start']} --> {line['start'] + line.get('duration', 0)}\n{line['text']}"
                for i, line in enumerate(transcript_list)
            ])
            file_name = f"{video_id}_subtitles.srt"

        else:
            return "지원되지 않는 파일 형식입니다. 'txt' 또는 'srt'를 선택하세요."

        # 파일 저장
        # with open(file_name, "w", encoding="utf-8") as file:
        #     file.write(file_content)
        
        # print(f"자막이 파일로 저장되었습니다: {file_name}")
        
        return file_name, file_content  # 저장된 파일 이름 반환

    except Exception as e:
        print(f"오류 발생: {e}")
        return str(e)  # 오류 메시지 반환
