export default function Footer() {
    return (
      <footer className="border-t border-gray-800 mt-32">
        <div className="max-w-7xl mx-auto px-6 py-12 flex justify-between text-sm text-gray-400">
          <p>© {new Date().getFullYear()} VIA</p>
  
          <div className="space-x-6">
          <a
  href="https://www.instagram.com/theviaplatform/"
  target="_blank"
  rel="noopener noreferrer"
  className="hover:text-white"
>
  Instagram
</a>
          </div>
        </div>
      </footer>
    );
  }

  