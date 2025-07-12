import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { ArrowLeft } from 'lucide-react'
import { ConversationChart } from '@/components/ConversationChart'
import './App.css'
import FOG from 'vanta/dist/vanta.fog.min.js'
import * as THREE from 'three'

// Define the structure for our data
type DMChannel = { id: string; name: string; avatar: string | null };
type EmotionData = { name: string; value: number; };
type AnalysisStats = { total_messages: number; participants: string[]; message_counts: Record<string, number>; date_range: { start: string; end: string }; chart_data: EmotionData[]; }
type TokenUsage = { input_tokens: number; output_tokens: number }
type QAPair = { question: string; answer: string; usage: TokenUsage }
type MbtiResult = { type: string; reason: string };
type AnimeResult = { character_name: string; reason: string };
type PopCultureResult = { character_name: string; reason: string };
type AnalysisResult = { 
  stats: AnalysisStats; 
  summary: { answer: string; usage: TokenUsage };
  mbti: Record<string, MbtiResult>;
  anime: Record<string, AnimeResult>;
  pop_culture: Record<string, PopCultureResult>;
}
type ProgressState = { status: 'idle' | 'fetching' | 'processing' | 'analyzing_summary' | 'analyzing_emotions' | 'analyzing_mbti' | 'analyzing_anime' | 'analyzing_pop_culture' | 'error'; fetched: number; error: string; current?: number; total?: number; }

const TypingIndicator = () => <div className="dot-flashing"></div>

function formatAIResponse(text: string): string {
  let html = '';
  const processedText = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  const lines = processedText.split('\n');
  let inList = false;
  
  for(let i=0; i < lines.length; i++) {
    const line = lines[i];

    if (line.trim().startsWith('* ')) {
      if (!inList) {
        html += '<ul class="list-disc list-inside my-2">';
        inList = true;
      }
      html += `<li>${line.trim().substring(2)}</li>`;
    } else {
      if (inList) {
        html += '</ul>';
        inList = false;
      }
      html += line;
      if (i < lines.length - 1) {
          html += '<br />';
      }
    }
  }

  if (inList) {
    html += '</ul>';
  }
  
  return html;
}

function getProgressMessage(progress: ProgressState): string {
  if (progress.status === 'fetching') return `Fetching ${progress.fetched} messages...`;
  if (progress.status === 'processing') return `Processing ${progress.fetched} messages...`;
  if (progress.status === 'analyzing_summary') return 'Creating summary...';
  if (progress.status === 'analyzing_emotions') return `Analyzing overall emotions...`;
  if (progress.status === 'analyzing_mbti') return 'Determining MBTI types...';
  if (progress.status === 'analyzing_anime') return 'Finding anime alter-egos...';
  if (progress.status === 'analyzing_pop_culture') return 'Matching pop culture characters...';
  if (progress.status === 'error') return `Error: ${progress.error}`;
  return 'Starting analysis...';
};

function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem('discordToken') || '');
  const [user, setUser] = useState<{ name: string; avatar: string } | null>(null)
  const [step, setStep] = useState<'token' | 'channel' | 'progress' | 'analysis'>(token ? 'channel' : 'token');
  const [dmChannels, setDmChannels] = useState<DMChannel[]>([])
  const [selectedChannel, setSelectedChannel] = useState<DMChannel | null>(null)
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [summary24h, setSummary24h] = useState<string | null>(null);
  const [isSummarizing24h, setIsSummarizing24h] = useState<boolean>(false);
  const [qaHistory, setQaHistory] = useState<QAPair[]>([])
  const [currentQuestion, setCurrentQuestion] = useState('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isTyping, setIsTyping] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [progress, setProgress] = useState<ProgressState>({ status: 'idle', fetched: 0, error: '' })
  const chatEndRef = useRef<HTMLDivElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const [vantaEffect, setVantaEffect] = useState<any>(null)
  const vantaRef = useRef(null)

  useEffect(() => {
    localStorage.setItem('discordToken', token);
  }, [token]);

  useEffect(() => {
    // If a token is loaded from localStorage, verify it and fetch channels
    const autoLogin = async () => {
      if (token && step === 'channel') {
        setIsLoading(true);
        try {
          const verifyResponse = await fetch('https://verifytoken-wlb45mix4a-uc.a.run.app', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          });
          const verifyData = await verifyResponse.json();

          if (verifyData.success) {
            setUser({ name: verifyData.user.username, avatar: `https://cdn.discordapp.com/avatars/${verifyData.user.id}/${verifyData.user.avatar}.png` });
            
            const channelsResponse = await fetch('https://getdmchannels-wlb45mix4a-uc.a.run.app', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token }),
            });
            const channelsData = await channelsResponse.json();
            if (channelsResponse.ok) {
              setDmChannels(channelsData);
            } else {
              throw new Error(channelsData.detail || 'Failed to fetch channels.');
            }
          } else {
            // Token is invalid, clear it and go back to token step
            setToken('');
            setStep('token');
            setError('Your saved token is invalid. Please enter it again.');
          }
        } catch (err: any) {
          setToken('');
          setStep('token');
          setError('Could not connect to the server. Please ensure it is running.');
        } finally {
          setIsLoading(false);
        }
      }
    };
    autoLogin();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    return () => {
      eventSourceRef.current?.close()
    }
  }, [qaHistory, isTyping])

  useEffect(() => {
    if (!vantaEffect) {
      setVantaEffect(
        FOG({
          el: vantaRef.current,
          THREE: THREE,
          highlightColor: 0x60a5fa,
          midtoneColor: 0x3b82f6,
          lowlightColor: 0x1d4ed8,
          baseColor: 0x000000,
          blurFactor: 0.5,
          zoom: 1.5,
          speed: 1.2,
        })
      );
    }
    return () => {
      if (vantaEffect) vantaEffect.destroy();
    };
  }, [vantaEffect]);

  const handleTokenSubmit = async () => {
    if (!token) {
      setError('Please enter a token.')
      return
    }
    setIsLoading(true)
    setError('')
    try {
      const response = await fetch('https://verifytoken-wlb45mix4a-uc.a.run.app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await response.json()
      if (data.success) {
        setUser({ name: data.user.username, avatar: `https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.png` })
        const channelsResponse = await fetch('https://getdmchannels-wlb45mix4a-uc.a.run.app', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        })
        const channelsData = await channelsResponse.json()
        if (channelsResponse.ok) {
          setDmChannels(channelsData)
          setStep('channel')
        } else {
          throw new Error(channelsData.detail || 'Failed to fetch channels.')
        }
      } else {
        throw new Error(data.error || 'Invalid token.')
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleBack = () => {
    if (step === 'analysis' || step === 'progress') {
      eventSourceRef.current?.close()
      setAnalysis(null)
      setQaHistory([])
      setProgress({ status: 'idle', fetched: 0, error: '' })
      setStep('channel')
    } else if (step === 'channel') {
      setUser(null)
      setToken('')
      setStep('token')
    }
  }

  const handleLogout = () => {
    setToken('');
    setUser(null);
    setStep('token');
  };

  const handleChannelSelect = async (channel: DMChannel) => {
    setSelectedChannel(channel)
    setStep('progress')
    setProgress({ status: 'fetching', fetched: 0, error: '' })

    eventSourceRef.current?.close()

    const url = new URL('https://streamanalyzechannel-wlb45mix4a-uc.a.run.app');
    url.searchParams.append('token', token);
    url.searchParams.append('channel_id', channel.id);
    
    const es = new EventSource(url.toString());

    eventSourceRef.current = es

    es.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data)
      setProgress(prev => ({ ...prev, ...data }))
    })

    es.addEventListener('result', (e) => {
      const result: AnalysisResult = JSON.parse(e.data)
      setAnalysis(result)
      setQaHistory([{
        question: "Initial Summary",
        answer: result.summary.answer,
        usage: result.summary.usage
      }])
      setStep('analysis')
      es.close()
    })

    es.addEventListener('error', (e) => {
      const errorMsg = (e as any).data || "An unknown error occurred."
      setProgress({ status: 'error', fetched: 0, error: errorMsg })
      es.close()
    })
  }

  const handleAskQuestion = async () => {
    if (!currentQuestion.trim() || !selectedChannel) return;

    const newQuestion = currentQuestion.trim()
    
    setQaHistory(prev => [...prev, { question: newQuestion, answer: '', usage: { input_tokens: 0, output_tokens: 0 } }])
    setCurrentQuestion('')
    setIsTyping(true)

    try {
      const response = await fetch('https://askquestion-wlb45mix4a-uc.a.run.app', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          channel_id: selectedChannel.id,
          question: newQuestion,
          qa_history: qaHistory.map(qa => ({ question: qa.question, answer: qa.answer })),
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.detail || 'Failed to get answer.')
      }

      const result: { answer: string; usage: TokenUsage } = await response.json()
      
      setQaHistory(prev => {
        const updatedHistory = [...prev]
        updatedHistory[updatedHistory.length - 1] = {
          question: newQuestion,
          answer: result.answer,
          usage: result.usage,
        }
        return updatedHistory
      })

    } catch (err: any) {
      setQaHistory(prev => {
        const updatedHistory = [...prev]
        updatedHistory[updatedHistory.length - 1].answer = `Error: ${err.message}`
        return updatedHistory
      })
    } finally {
      setIsTyping(false)
    }
  };

  const handleSummarize24h = async () => {
    if (!selectedChannel) return;
    setIsSummarizing24h(true);
    setSummary24h(null);
    try {
      const response = await fetch('http://localhost:8000/api/summarize-last-24h', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          channel_id: selectedChannel.id,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to get summary.');
      }
      const result: { summary: string } = await response.json();
      setSummary24h(result.summary);
    } catch (err: any) {
      setSummary24h(`Error: ${err.message}`);
    } finally {
      setIsSummarizing24h(false);
    }
  };

  const renderTokenScreen = () => (
    <div className="w-full max-w-4xl grid md:grid-cols-2 gap-8 items-center animate-fadeIn">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold animate-fadeInScaleUp" style={{ animationDelay: '0.1s' }}>Unlock Your Discord History</h1>
        <p className="text-gray-400 animate-fadeInScaleUp" style={{ animationDelay: '0.2s' }}>
          Ever wondered what your Discord DMs say about you? Our analyzer dives deep into your conversation history to reveal fascinating insights.
        </p>
        <div className="space-y-3 pt-4">
          <div className="flex items-center space-x-3 animate-fadeInScaleUp" style={{ animationDelay: '0.3s' }}>
            <div className="bg-indigo-500/20 text-indigo-300 rounded-full p-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20v-6M6 20v-4M18 20v-8"/></svg>
            </div>
            <div className="text-left">
              <h3 className="font-semibold">Emotional Insights</h3>
              <p className="text-gray-400 text-sm">Visualize the emotional tone of your chat over time.</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 animate-fadeInScaleUp" style={{ animationDelay: '0.4s' }}>
            <div className="bg-indigo-500/20 text-indigo-300 rounded-full p-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>
            </div>
            <div className="text-left">
              <h3 className="font-semibold">Personality Analysis</h3>
              <p className="text-gray-400 text-sm">Discover your MBTI type and your anime/pop-culture doppelgänger based on your chats.</p>
            </div>
          </div>
          <div className="flex items-center space-x-3 animate-fadeInScaleUp" style={{ animationDelay: '0.5s' }}>
            <div className="bg-indigo-500/20 text-indigo-300 rounded-full p-2">
               <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-1.141-1.403l-4.12 3.301-1.365-1.705a1 1 0 0 0-1.428.239L9 12.023l-1.33-1.11a1 1 0 0 0-1.306 1.503l1.96 1.633a1 1 0 0 0 1.39-.06L14 8l3.14 3.925a1 1 0 0 0 1.368-.216l2-2.828Z"/><path d="M5 12a7 7 0 1 1 14 0 7 7 0 0 1-14 0Z"/></svg>
            </div>
            <div className="text-left">
              <h3 className="font-semibold">Interactive Q&A</h3>
              <p className="text-gray-400 text-sm">Ask questions directly to your chat history and get instant answers.</p>
            </div>
          </div>
        </div>
      </div>
      <div className="animate-fadeInScaleUp" style={{ animationDelay: '0.3s' }}>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Enter Your Discord Token</CardTitle>
            <CardDescription>
              To begin, you need to provide your Discord User Token.
              <strong className="text-orange-400 block mt-2">This is a temporary access key and is only stored on your computer.</strong>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
      <div>
                <h3 className="font-bold text-md mb-2">How to get your Discord Token:</h3>
                <ol className="list-decimal list-inside text-sm space-y-1 text-gray-400">
                  <li>Open Discord in your browser (e.g. Chrome).</li>
                  <li>Press <kbd>Cmd+Opt+I</kbd> (Mac) or <kbd>Ctrl+Shift+I</kbd> (Windows) to open Developer Tools.</li>
                  <li>Go to the "Network" tab.</li>
                  <li>Type <kbd>/api</kbd> in the filter box.</li>
                  <li>Click any request, go to the "Headers" tab, and find the <kbd>authorization</kbd> header.</li>
                  <li>Copy the token and paste it below.</li>
                </ol>
            </div>
            <div className="space-y-2">
              <Label htmlFor="token-input">Discord User Token</Label>
              <Input id="token-input" type="password" placeholder="Your Discord Token" value={token} onChange={e => setToken(e.target.value)} />
              {error && <p className="text-red-500 text-sm">{error}</p>}
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={handleTokenSubmit} disabled={isLoading} className="w-full">
              {isLoading ? 'Verifying...' : 'Analyze My DMs'}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  )

  const renderChannelSelect = () => (
    <div className="w-full max-w-4xl">
      <div className="flex justify-between items-center mb-4">
          {user && (
              <div className="flex items-center space-x-2">
                  <Avatar>
                      <AvatarImage src={user.avatar} alt={user.name} />
                      <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <span className="text-white">Welcome, {user.name}!</span>
              </div>
          )}
          <Button onClick={handleLogout} variant="outline">Log Out</Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Select a DM to Analyze</CardTitle>
          <CardDescription>We've found your recent conversations. Pick one to get started.</CardDescription>
        </CardHeader>
        <CardContent className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <p className="text-center">Loading channels...</p>
          ) : (
            <div className="space-y-2">
              {dmChannels.map((channel) => (
                <Button
                  key={channel.id}
                  onClick={() => handleChannelSelect(channel)}
                  variant="ghost"
                  className="w-full justify-start text-left h-auto py-2"
                >
                  <div className="flex items-center space-x-3">
                    <Avatar>
                      <AvatarImage src={channel.avatar || undefined} alt={channel.name} />
                      <AvatarFallback>{channel.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <span>{channel.name}</span>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )

  const renderProgress = () => {
    const getProgressValue = () => {
      if (progress.status === 'fetching') return (progress.fetched % 1000) / 10;
      const stages = ['processing', 'analyzing_summary', 'analyzing_emotions', 'analyzing_mbti', 'analyzing_anime', 'analyzing_pop_culture'];
      const currentStageIndex = stages.indexOf(progress.status);
      if (currentStageIndex !== -1) {
        return 100 * (currentStageIndex + 1) / (stages.length + 1);
      }
      return 0;
    };
    
    return (
      <div className="fadeInScaleUp fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <Card className="w-[350px] bg-gray-800 border-gray-700 text-white shadow-lg shadow-blue-500/20">
          <CardHeader>
            <CardTitle>Analyzing Conversation</CardTitle>
            <CardDescription>{selectedChannel?.name}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center">
            <Progress value={getProgressValue()} className="w-full" />
            <p className="text-sm text-gray-400 mt-4">{getProgressMessage(progress)}</p>
          </CardContent>
           <CardFooter className="flex justify-center">
            <Button variant="ghost" className="text-gray-400" onClick={handleBack}><ArrowLeft className="mr-2 h-4 w-4" /> Go Back</Button>
          </CardFooter>
        </Card>
      </div>
    );
  };

  const renderAnalysis = () => {
    if (!analysis) return null
    return (
      <div className="w-full max-w-7xl mx-auto px-4">
        <div className="flex justify-between items-center mb-4">
          <Button onClick={handleBack}><ArrowLeft className="mr-2 h-4 w-4"/>Back to Channels</Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button onClick={handleSummarize24h} disabled={isSummarizing24h}>
                {isSummarizing24h ? 'Summarizing...' : 'Summarize Last 24h'}
              </Button>
            </DialogTrigger>
            {(summary24h || isSummarizing24h) && (
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Summary of Last 24 Hours</DialogTitle>
                </DialogHeader>
                {isSummarizing24h && <p>Loading summary...</p>}
                {summary24h && !isSummarizing24h && <div className="py-4" dangerouslySetInnerHTML={{ __html: formatAIResponse(summary24h) }} />}
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="secondary">Close</Button>
                  </DialogClose>
                </DialogFooter>
              </DialogContent>
            )}
          </Dialog>
        </div>
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold">Analysis for your conversation with {selectedChannel?.name}</h1>
          <p className="text-lg text-gray-400">
            {new Date(analysis.stats.date_range.start).toLocaleDateString()} - {new Date(analysis.stats.date_range.end).toLocaleDateString()}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="text-center">
            <CardHeader><CardTitle>Total Messages</CardTitle></CardHeader>
            <CardContent><p className="text-4xl font-bold">{analysis.stats.total_messages}</p></CardContent>
          </Card>
          {analysis.stats.participants.map(p => (
            <Card key={p} className="text-center">
              <CardHeader><CardTitle>{p}'s Messages</CardTitle></CardHeader>
              <CardContent><p className="text-4xl font-bold">{analysis.stats.message_counts[p]}</p></CardContent>
            </Card>
          ))}
        </div>
        
        <Card className="mb-8">
            <CardHeader><CardTitle className="text-center">Conversation Summary</CardTitle></CardHeader>
            <CardContent>
              <div
                className="prose prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: formatAIResponse(analysis.summary.answer) }}
              />
            </CardContent>
        </Card>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-center">Conversation Activity & Emotional Tone</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ConversationChart data={analysis.stats.chart_data} />
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-center">MBTI Personality</CardTitle>
            </CardHeader>
            <CardContent>
              {analysis.mbti && Object.entries(analysis.mbti).map(([participant, result]) => (
                <div key={participant} className="mb-4">
                  <p className="text-center"><strong>{participant}</strong></p>
                  <p className="text-center text-2xl font-bold my-2">{result.type}</p>
                  <p className="text-center text-sm text-gray-400">{result.reason}</p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Anime Resemblance</CardTitle>
            </CardHeader>
            <CardContent>
              {analysis.anime && Object.entries(analysis.anime).map(([participant, result]) => (
                <div key={participant} className="mb-4">
                  <p className="text-center"><strong>{participant}</strong></p>
                  <p className="text-center text-2xl font-bold my-2">{result.character_name}</p>
                  <p className="text-center text-sm text-gray-400">{result.reason}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-center">Pop Culture Resemblance</CardTitle>
            </CardHeader>
            <CardContent>
              {analysis.pop_culture && Object.entries(analysis.pop_culture).map(([participant, result]) => (
                <div key={participant} className="mb-4">
                  <p className="text-center"><strong>{participant}</strong></p>
                  <p className="text-center text-2xl font-bold my-2">{result.character_name}</p>
                  <p className="text-center text-sm text-gray-400">{result.reason}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="mt-8">
          <h3 className="text-2xl font-bold text-center mb-4">Chat with Your History</h3>
          <div className="bg-gray-800 rounded-lg p-4 h-[500px] overflow-y-auto" style={{
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '0.75rem',
            padding: '1rem',
            height: '500px',
            overflowY: 'auto',
          }}>
            {qaHistory.map((qa, i) => (
              <div key={i} className="space-y-4">
                {qa.question !== "Initial Summary" && (
                  <div className="flex items-start justify-end">
                    <p className="bg-indigo-600 rounded-lg px-4 py-2 max-w-xl">{qa.question}</p>
                  </div>
                )}
                <div className="flex items-end space-x-2">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src="/gemini-icon.png" alt="AI" />
                    <AvatarFallback>AI</AvatarFallback>
                  </Avatar>
                  <div className="bg-gray-700 rounded-lg px-4 py-2 max-w-xl">
                    {qa.answer ? <p dangerouslySetInnerHTML={{ __html: formatAIResponse(qa.answer) }} /> : <TypingIndicator />}
                    {qa.usage && qa.usage.output_tokens > 0 && <p className="text-xs text-gray-500 pt-2">Tokens: {qa.usage.input_tokens}+{qa.usage.output_tokens}</p>}
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="mt-4 flex">
            <Input
              value={currentQuestion}
              onChange={e => setCurrentQuestion(e.target.value)}
              onKeyPress={e => e.key === 'Enter' && handleAskQuestion()}
              placeholder="Ask a follow-up question..."
              className="flex-grow"
              disabled={isTyping}
            />
            <Button onClick={handleAskQuestion} disabled={isTyping || !currentQuestion.trim()} className="ml-2">
              {isTyping ? 'Thinking...' : 'Ask'}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const renderContent = () => {
    switch (step) {
      case 'token':
        return renderTokenScreen();
      case 'channel':
        return renderChannelSelect();
      case 'progress':
        return renderProgress();
      case 'analysis':
        return renderAnalysis();
      default:
        return null;
    }
  }

  return (
    <>
      <div ref={vantaRef} className="fixed top-0 left-0 w-full h-full -z-10" />
      <main className="dark bg-transparent text-white min-h-screen flex items-center justify-center p-4">
        {renderContent()}
      </main>
    </>
  )
}

export default App
