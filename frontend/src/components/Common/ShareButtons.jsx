import { useState } from 'react';

export default function ShareButtons({ title, url }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = url || window.location.href;
  const shareTitle = title || document.title;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleKakaoShare = () => {
    if (window.Kakao?.Share) {
      window.Kakao.Share.sendDefault({
        objectType: 'feed',
        content: {
          title: shareTitle,
          description: '아파트 시세 정보를 확인해보세요',
          imageUrl: '',
          link: { mobileWebUrl: shareUrl, webUrl: shareUrl },
        },
        buttons: [
          { title: '시세 보기', link: { mobileWebUrl: shareUrl, webUrl: shareUrl } },
        ],
      });
    } else {
      // 카카오 SDK 미로드 시 카카오톡 공유 URL
      window.open(
        `https://sharer.kakao.com/talk/friends/picker/link?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareTitle)}`,
        '_blank',
        'width=600,height=400'
      );
    }
  };

  const handleNaverShare = () => {
    window.open(
      `https://share.naver.com/web/shareView?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareTitle)}`,
      '_blank',
      'width=600,height=400'
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={handleCopyLink}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm text-gray-600 transition-colors"
        title="링크 복사"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
        {copied ? '복사됨!' : '링크 복사'}
      </button>

      <button
        onClick={handleKakaoShare}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
        style={{ backgroundColor: '#FEE500', color: '#191919' }}
        title="카카오톡 공유"
      >
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
          <path d="M10 0C4.478 0 0 3.588 0 8.015c0 2.86 1.89 5.37 4.735 6.79-.21.78-.76 2.83-.87 3.27-.14.54.2.53.42.39.17-.12 2.75-1.87 3.86-2.63.6.09 1.22.13 1.85.13 5.522 0 10-3.588 10-8.015C20 3.588 15.522 0 10 0z" fill="#191919"/>
        </svg>
        카카오톡
      </button>

      <button
        onClick={handleNaverShare}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition-colors"
        style={{ backgroundColor: '#03C75A' }}
        title="네이버 공유"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
          <path d="M13.5 10.56L6.26 0H0v20h6.5V9.44L13.74 20H20V0h-6.5v10.56z" fill="white"/>
        </svg>
        네이버
      </button>
    </div>
  );
}
