import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-100 px-6 py-4 flex items-center justify-between max-w-5xl mx-auto">
        <span className="font-bold text-lg">FormFlood</span>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">Sign in</Link>
          <Link href="/signup" className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700">
            Get started
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-24 text-center">
        <h1 className="text-5xl font-bold text-gray-900 mb-6 leading-tight">
          Fill Google Forms<br />at scale
        </h1>
        <p className="text-xl text-gray-500 mb-10 max-w-xl mx-auto">
          Paste a form URL, configure response distributions, and let FormFlood
          submit hundreds of responses in the background.
        </p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/signup" className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700">
            Get started free
          </Link>
          <Link href="/login" className="text-gray-600 px-6 py-3 rounded-lg font-medium hover:bg-gray-50 border border-gray-200">
            Sign in
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-8 mt-24 text-left">
          {[
            { title: "Parse any form", desc: "Paste a Google Form URL and we instantly extract all questions and options." },
            { title: "Custom distributions", desc: "Set exactly what percentage of responses go to each option per question." },
            { title: "Runs in background", desc: "Close the tab — your job keeps running. Come back to see live progress." },
          ].map(f => (
            <div key={f.title} className="p-6 border border-gray-100 rounded-xl">
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
