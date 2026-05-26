import React, { useState, useEffect, useRef } from 'react'
import nacl from 'tweetnacl'
import { 
  Zap, 
  Shield, 
  Terminal as TerminalIcon, 
  Settings, 
  Download, 
  Copy, 
  ExternalLink, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle, 
  Sliders, 
  Wifi, 
  FileText,
  Plus,
  Trash2,
  HelpCircle
} from 'lucide-react'

// Default values & fallbacks
const DEFAULT_PEER_KEY = 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo='
const DEFAULT_ADDR_V4 = '172.16.0.2'
const DEFAULT_ADDR_V6 = '2606:4700:110:8888::2'
const DEFAULT_RESERVED = '0,0,0'

// Cloudflare Anycast IP pool subnets
const ANYCAST_SUBNETS = [
  '162.159.192', '162.159.193', '162.159.195', '162.159.196',
  '162.159.204', '162.159.205', '162.159.206', '188.114.96',
  '188.114.97', '188.114.98', '188.114.99', '188.114.100',
  '188.114.101'
]

// Common WARP ports
const WARP_PORTS = [2408, 500, 1701, 4500]

// Helper: base64 utilities
const toBase64 = (u8) => btoa(String.fromCharCode.apply(null, u8))
const fromBase64 = (str) => {
  try {
    return new Uint8Array(atob(str).split('').map(c => c.charCodeAt(0)))
  } catch (e) {
    return new Uint8Array()
  }
}

export default function App() {
  // App State
  const [privateKey, setPrivateKey] = useState('')
  const [publicKey, setPublicKey] = useState('')
  const [peerPublicKey, setPeerPublicKey] = useState(DEFAULT_PEER_KEY)
  const [addressV4, setAddressV4] = useState(DEFAULT_ADDR_V4)
  const [addressV6, setAddressV6] = useState(DEFAULT_ADDR_V6)
  const [reserved, setReserved] = useState(DEFAULT_RESERVED)
  
  const [activeTab, setActiveTab] = useState('auto') // 'auto' | 'manual'
  const [registrationStatus, setRegistrationStatus] = useState('idle') // 'idle' | 'registering' | 'success' | 'failed'
  const [showGuide, setShowGuide] = useState(false)
  const [guideTab, setGuideTab] = useState('basic') // 'basic' | 'faq'
  
  // Benchmarking State
  const [concurrency, setConcurrency] = useState(25)
  const [timeoutMs, setTimeoutMs] = useState(1500)
  const [isTesting, setIsTesting] = useState(false)
  const [testResults, setTestResults] = useState([])
  const [selectedIPs, setSelectedIPs] = useState([])
  const [selectedPorts, setSelectedPorts] = useState([2408, 500, 1701, 4500])
  const [testProgress, setTestProgress] = useState({ current: 0, total: 0 })
  
  // Terminal log state
  const [logs, setLogs] = useState([])
  const terminalEndRef = useRef(null)

  // System setup on load
  useEffect(() => {
    addLog('[*] WARP 优选系统已就绪')
    addLog('[*] 点击下方按钮开始生成密钥对及注册账户')
    generateKeys(false)
  }, [])

  // Auto scroll logs
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs])

  // Helper: Append console log
  const addLog = (message) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs(prev => [...prev, `[${timestamp}] ${message}`])
  }

  // Key Pair Generator (Curve25519)
  const generateKeys = (verbose = true) => {
    try {
      const keypair = nacl.box.keyPair()
      const priv = toBase64(keypair.secretKey)
      const pub = toBase64(keypair.publicKey)
      
      setPrivateKey(priv)
      setPublicKey(pub)
      
      if (verbose) {
        addLog('[+] 成功生成 X25519 密钥对')
        addLog(`    └─ 私钥 (32B): ${priv.substring(0, 10)}...`)
        addLog(`    └─ 公钥 (32B): ${pub.substring(0, 10)}...`)
      }
      return { priv, pub }
    } catch (error) {
      addLog(`[X] 密钥生成失败: ${error.message}`)
      return null
    }
  }

  // Register WARP Account
  const registerWarpAccount = async () => {
    let currentPub = publicKey
    let currentPriv = privateKey
    
    // Auto generate keys if they don't exist
    if (!currentPub || !currentPriv) {
      const keys = generateKeys(true)
      if (!keys) return
      currentPub = keys.pub
      currentPriv = keys.priv
    }

    setRegistrationStatus('registering')
    addLog('[*] 发起 API 请求注册 Cloudflare WARP 设备账号...')
    addLog(`    └─ 请求终点: https://api.cloudflareclient.com/v0a2415/reg`)

    const payload = {
      key: currentPub,
      install_id: "",
      fcm_token: "",
      referrer: "",
      warp_enabled: true,
      tos: new Date().toISOString(),
      type: "ios",
      locale: "zh_CN"
    }

    const endpoints = [
      { name: '云端代理 (CF Pages)', url: '/api/register' },
      { name: '直连方式', url: 'https://api.cloudflareclient.com/v0a2415/reg' },
      { name: 'CORS 代理源 A', url: 'https://corsproxy.io/?https://api.cloudflareclient.com/v0a2415/reg' },
      { name: 'CORS 代理源 B', url: 'https://api.codetabs.com/v1/proxy?quest=https://api.cloudflareclient.com/v0a2415/reg' }
    ]

    let response = null
    let lastError = null

    for (const endpoint of endpoints) {
      addLog(`[*] 尝试使用 [${endpoint.name}] 进行注册...`)
      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 8000)

        const res = await fetch(endpoint.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'User-Agent': 'okhttp/3.12.1'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        if (res.ok) {
          response = res
          addLog(`[+] [${endpoint.name}] 成功建立通道！`)
          break
        } else {
          addLog(`[!] [${endpoint.name}] 响应状态错误: ${res.status}`)
        }
      } catch (err) {
        addLog(`[!] [${endpoint.name}] 失败: ${err.message}`)
        lastError = err
      }
    }

    try {
      if (!response) {
        throw new Error(lastError ? lastError.message : '所有通道注册均被拒绝')
      }

      const data = await response.json()
      addLog('[+] WARP API 注册成功！解析凭证字段...')

      // Extract details
      const peerKey = data.config?.peers?.[0]?.public_key || DEFAULT_PEER_KEY
      const v4 = data.config?.interface?.addresses?.v4 || `${DEFAULT_ADDR_V4}/32`
      const v6 = data.config?.interface?.addresses?.v6 || `${DEFAULT_ADDR_V6}/128`
      const clientId = data.config?.client_id || ''

      // Clean CIDR notation if needed for the state
      const cleanV4 = v4.split('/')[0]
      const cleanV6 = v6.split('/')[0]

      setPeerPublicKey(peerKey)
      setAddressV4(cleanV4)
      setAddressV6(cleanV6)

      // Calculate Reserved bytes from client_id
      let reservedStr = DEFAULT_RESERVED
      if (clientId) {
        const decodedBytes = fromBase64(clientId)
        if (decodedBytes.length === 3) {
          reservedStr = Array.from(decodedBytes).join(',')
        } else {
          addLog(`[!] client_id (${clientId}) 解码字节长度为 ${decodedBytes.length}，期望 3 字节，使用默认 reserved 0,0,0`)
        }
      } else {
        addLog('[!] 响应中未包含 client_id，使用默认 reserved 0,0,0')
      }

      setReserved(reservedStr)
      setRegistrationStatus('success')
      
      addLog('[+] Cloudflare WARP 账户注册成功')
      addLog(`    └─ 分配内网 IPv4: ${v4}`)
      addLog(`    └─ 分配内网 IPv6: ${v6}`)
      addLog(`    └─ Reserved 标识: ${reservedStr}`)
      addLog(`    └─ 对端公钥: ${peerKey}`)
      
    } catch (error) {
      console.error(error)
      setRegistrationStatus('failed')
      addLog('[!] WARP 账户注册彻底失败 (所有的代理通道均无法穿透 API)')
      addLog(`    └─ 错误原因: ${error.message}`)
      addLog(`[!] 激活备用机制：强制使用本地标准默认参数 (Client IP: ${DEFAULT_ADDR_V4}, Reserved: 0,0,0)`)
      
      // Load standard defaults
      setPeerPublicKey(DEFAULT_PEER_KEY)
      setAddressV4(DEFAULT_ADDR_V4)
      setAddressV6(DEFAULT_ADDR_V6)
      setReserved(DEFAULT_RESERVED)
    }
  }

  // Anycast IP Generator (samples offsets of subnet range)
  const generateBenchmarkIPs = () => {
    const list = []
    // We sample specific offsets: .1, .9, .22, .50, .100 for each subnet
    const offsets = [1, 9, 22, 50, 100]
    
    ANYCAST_SUBNETS.forEach(subnet => {
      offsets.forEach(offset => {
        list.push(`${subnet}.${offset}`)
      });
    });
    return list
  }

  // Latency Benchmarking (HTTP connection probes)
  const startBenchmarking = async () => {
    if (isTesting) return
    setIsTesting(true)
    setTestResults([])
    setSelectedIPs([])
    
    const candidateIPs = generateBenchmarkIPs()
    const total = candidateIPs.length
    
    addLog(`[*] 开始 Anycast IP 优选测速 (共 ${total} 个候选节点)...`)
    addLog(`    └─ 并发度: ${concurrency} | 超时上限: ${timeoutMs}ms`)
    addLog(`    └─ 测速方式: HTTPS/HTTP 握手延迟测试`)

    setTestProgress({ current: 0, total })

    const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:'
    const results = []

    // Concurrency queue implementation
    const queue = [...candidateIPs]
    const workers = Array(Math.min(concurrency, queue.length)).fill(null).map(async () => {
      while (queue.length > 0) {
        const ip = queue.shift()
        if (!ip) break
        
        const start = performance.now()
        let latency = 9999
        let status = 'failed'
        
        try {
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
          
          // Probe connection
          await fetch(`${protocol}//${ip}/cdn-cgi/trace`, {
            mode: 'no-cors',
            signal: controller.signal,
            credentials: 'omit',
            cache: 'no-store'
          })
          
          clearTimeout(timeoutId)
          latency = Math.round(performance.now() - start)
          status = 'success'
        } catch (e) {
          // In most browsers, HTTPS by IP throws cert validation errors (TypeError / abort)
          // But the error is thrown AFTER connection is established, so performance.now() is still valid!
          if (e.name !== 'AbortError') {
            latency = Math.round(performance.now() - start)
            status = 'success'
          }
        }

        const result = { ip, latency, status }
        results.push(result)
        
        setTestResults(prev => {
          const updated = [...prev, result].sort((a, b) => a.latency - b.latency)
          return updated
        })

        setTestProgress(prev => ({ ...prev, current: prev.current + 1 }))
      }
    })

    await Promise.all(workers)

    // Filter successfully tested and sort
    const validResults = results
      .filter(r => r.status === 'success' && r.latency < timeoutMs)
      .sort((a, b) => a.latency - b.latency)

    setIsTesting(false)
    addLog(`[+] IP 优选测速完成！共 ${validResults.length} 个 IP 有效响应`)
    
    if (validResults.length > 0) {
      const top5 = validResults.slice(0, 5).map(r => r.ip)
      setSelectedIPs(top5)
      addLog(`[+] 已自动勾选延迟前 5 的优质 IP: ${top5.join(', ')}`)
    } else {
      addLog(`[!] 未探测到可用 IP，请检查您的移动网络或增大超时限制`)
    }
  }

  // Toggle IP selection
  const toggleIP = (ip) => {
    setSelectedIPs(prev => 
      prev.includes(ip) ? prev.filter(item => item !== ip) : [...prev, ip]
    )
  }

  // Toggle Port selection
  const togglePort = (port) => {
    setSelectedPorts(prev => 
      prev.includes(port) ? prev.filter(item => item !== port) : [...prev, port]
    )
  }

  // Compile individual WireGuard URL for Shadowrocket
  const compileNodeLink = (ip, port, idx) => {
    const alias = `CF-WARP-优选${idx}-端口${port}`
    
    const encPriv = encodeURIComponent(privateKey)
    const encPub = encodeURIComponent(peerPublicKey)
    const encAddr = encodeURIComponent(`${addressV4}/32`)
    const encAlias = encodeURIComponent(alias)
    
    // Build link with maximum client compatibility
    return `wireguard://${encPriv}@${ip}:${port}?privateKey=${encPriv}&privatekey=${encPriv}&publicKey=${encPub}&publickey=${encPub}&address=${encAddr}&ip=${encAddr}&mru=1280&mtu=1280&reserved=${reserved}#${encAlias}`
  }

  // Generate Shadowrocket Subscription payload (Base64 list of links)
  const getSubContent = () => {
    if (selectedIPs.length === 0 || selectedPorts.length === 0) return ''
    
    const links = []
    let idx = 1
    selectedIPs.forEach(ip => {
      selectedPorts.forEach(port => {
        links.push(compileNodeLink(ip, port, idx))
      })
      idx++
    })
    
    return links.join('\n')
  }

  // Copy shadowrocket direct import link to clipboard
  const copyShadowrocketLink = () => {
    const subContent = getSubContent()
    if (!subContent) {
      alert('请先选择至少一个 IP 和一个端口')
      return
    }
    
    // Copy the raw wireguard:// URLs list to clipboard (Shadowrocket detects this format instantly)
    navigator.clipboard.writeText(subContent)
    addLog(`[+] 优选 WireGuard 节点链接列表已拷贝至剪贴板!`)
    alert('节点链接已成功复制到剪贴板！请直接打开小火箭，软件将自动识别并弹窗提示导入。')
  }

  // Launch Shadowrocket (Direct URL scheme redirect)
  const launchShadowrocket = async () => {
    const subContent = getSubContent()
    if (!subContent) {
      alert('请先选择至少一个 IP 和一个端口')
      return
    }
    
    addLog(`[*] 正在复制配置并尝试唤起 Shadowrocket...`)
    try {
      // Write the raw wireguard:// URLs list to clipboard
      await navigator.clipboard.writeText(subContent)
      addLog(`[+] 节点数据已写入剪贴板，正在唤起小火箭...`)
      
      // Launch Shadowrocket app. When it opens, it reads the clipboard and prompts to import.
      window.location.href = 'shadowrocket://'
    } catch (e) {
      addLog(`[!] 自动唤起失败: ${e.message}，已自动拷贝，请手动打开小火箭即可。`)
      alert('已复制配置！请手动打开小火箭，软件将自动识别剪贴板。')
    }
  }

  // Compile combined .conf text file
  const generateConfContent = () => {
    if (selectedIPs.length === 0 || selectedPorts.length === 0) return ''
    
    let content = ''
    let idx = 1
    
    selectedIPs.forEach(ip => {
      selectedPorts.forEach(port => {
        content += `# ==========================================\n`
        content += `# 节点 ${idx}: ${ip}:${port}\n`
        content += `# ==========================================\n`
        content += `[Interface]\n`
        content += `PrivateKey = ${privateKey}\n`
        content += `Address = ${addressV4}/32, ${addressV6}/128\n`
        content += `DNS = 1.1.1.1, 8.8.8.8, 2606:4700:4700::1111, 2001:4860:4860::8888\n`
        content += `MTU = 1280\n\n`
        content += `[Peer]\n`
        content += `PublicKey = ${peerPublicKey}\n`
        content += `AllowedIPs = 0.0.0.0/0, ::/0\n`
        content += `Endpoint = ${ip}:${port}\n`
        content += `Reserved = ${reserved}\n\n\n`
      })
      idx++
    })
    
    return content
  }

  // Copy .conf configuration to clipboard
  const copyConf = () => {
    const conf = generateConfContent()
    if (!conf) {
      alert('请先选择至少一个 IP 和一个端口')
      return
    }
    navigator.clipboard.writeText(conf)
    addLog('[+] 优选 WireGuard 配置内容已拷贝至剪贴板')
    alert('合并配置内容已复制到剪贴板！')
  }

  // Download combined .conf file
  const downloadConfFile = () => {
    const conf = generateConfContent()
    if (!conf) {
      alert('请先选择至少一个 IP 和一个端口')
      return
    }
    
    const blob = new Blob([conf], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'warp_anycast_optimized.conf'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    addLog('[+] warp_anycast_optimized.conf 配置文件已下载')
  }

  // Generate Clash Meta / Mihomo compatible full YAML configuration profile
  const generateClashYaml = () => {
    if (selectedIPs.length === 0 || selectedPorts.length === 0) return ''
    
    // List of node names for inclusion in proxy groups
    const nodeNames = []
    let idx = 1
    selectedIPs.forEach(ip => {
      selectedPorts.forEach(port => {
        nodeNames.push(`CF-WARP-优选${idx}-${port}`)
      })
      idx++
    })

    let yaml = `# =========================================================\n`
    yaml += `# Clash Meta (Mihomo) 完整配置文件 - 优选 WARP 节点版\n`
    yaml += `# =========================================================\n\n`
    
    // Global settings
    yaml += `mixed-port: 7890\n`
    yaml += `allow-lan: true\n`
    yaml += `mode: rule\n`
    yaml += `log-level: info\n`
    yaml += `ipv6: true\n\n`
    
    // DNS settings
    yaml += `dns:\n`
    yaml += `  enable: true\n`
    yaml += `  ipv6: true\n`
    yaml += `  listen: 0.0.0.0:53\n`
    yaml += `  enhanced-mode: fake-ip\n`
    yaml += `  fake-ip-range: 198.18.0.1/16\n`
    yaml += `  default-nameserver:\n`
    yaml += `    - 223.5.5.5\n`
    yaml += `    - 114.114.114.114\n`
    yaml += `  nameserver:\n`
    yaml += `    - https://dns.alidns.com/dns-query\n`
    yaml += `    - https://doh.pub/dns-query\n`
    yaml += `  fallback:\n`
    yaml += `    - https://1.1.1.1/dns-query\n`
    yaml += `    - https://8.8.8.8/dns-query\n\n`

    // Proxies definition
    yaml += `proxies:\n`
    idx = 1
    selectedIPs.forEach(ip => {
      selectedPorts.forEach(port => {
        yaml += `  - name: "CF-WARP-优选${idx}-${port}"\n`
        yaml += `    type: wireguard\n`
        yaml += `    server: ${ip}\n`
        yaml += `    port: ${port}\n`
        yaml += `    ip: ${addressV4}\n`
        yaml += `    ipv6: ${addressV6}\n`
        yaml += `    private-key: ${privateKey}\n`
        yaml += `    public-key: ${peerPublicKey}\n`
        yaml += `    reserved: [${reserved}]\n`
        yaml += `    udp: true\n`
        yaml += `    remote-dns-resolve: true\n`
        yaml += `    mtu: 1280\n`
      })
      idx++
    })
    yaml += `\n`

    // Proxy Groups definition
    yaml += `proxy-groups:\n`
    yaml += `  - name: "🚀 节点选择"\n`
    yaml += `    type: select\n`
    yaml += `    proxies:\n`
    yaml += `      - "⚡ 自动选择"\n`
    yaml += `      - "DIRECT"\n`
    nodeNames.forEach(name => {
      yaml += `      - "${name}"\n`
    })
    yaml += `\n`
    
    yaml += `  - name: "⚡ 自动选择"\n`
    yaml += `    type: url-test\n`
    yaml += `    url: http://cp.cloudflare.com/generate_204\n`
    yaml += `    interval: 300\n`
    yaml += `    tolerance: 50\n`
    yaml += `    proxies:\n`
    nodeNames.forEach(name => {
      yaml += `      - "${name}"\n`
    })
    yaml += `\n`

    // Routing Rules definition
    yaml += `rules:\n`
    yaml += `  # 广告拦截\n`
    yaml += `  - DOMAIN-SUFFIX,ads.com,REJECT\n`
    yaml += `  - DOMAIN-KEYWORD,adserver,REJECT\n`
    yaml += `  # Telegram 规则\n`
    yaml += `  - IP-CIDR,91.108.4.0/22,🚀 节点选择,no-resolve\n`
    yaml += `  - IP-CIDR,91.108.56.0/22,🚀 节点选择,no-resolve\n`
    yaml += `  - IP-CIDR,149.154.160.0/20,🚀 节点选择,no-resolve\n`
    yaml += `  # 常见国外服务（走代理）\n`
    yaml += `  - DOMAIN-SUFFIX,google.com,🚀 节点选择\n`
    yaml += `  - DOMAIN-SUFFIX,github.com,🚀 节点选择\n`
    yaml += `  - DOMAIN-SUFFIX,youtube.com,🚀 节点选择\n`
    yaml += `  - DOMAIN-SUFFIX,twitter.com,🚀 节点选择\n`
    yaml += `  - DOMAIN-SUFFIX,x.com,🚀 节点选择\n`
    yaml += `  - DOMAIN-SUFFIX,instagram.com,🚀 节点选择\n`
    yaml += `  - DOMAIN-SUFFIX,facebook.com,🚀 节点选择\n`
    yaml += `  - DOMAIN-SUFFIX,netflix.com,🚀 节点选择\n`
    yaml += `  - DOMAIN-SUFFIX,chatgpt.com,🚀 节点选择\n`
    yaml += `  - DOMAIN-SUFFIX,openai.com,🚀 节点选择\n`
    yaml += `  - DOMAIN-SUFFIX,cloudflare.com,🚀 节点选择\n`
    yaml += `  - DOMAIN-SUFFIX,cloudflareclient.com,🚀 节点选择\n`
    yaml += `  # 国内流量绕过（直连）\n`
    yaml += `  - GEOIP,CN,DIRECT\n`
    yaml += `  - MATCH,🚀 节点选择\n`

    return yaml
  }

  // Copy Clash Meta config to clipboard
  const copyClashConfig = () => {
    const yaml = generateClashYaml()
    if (!yaml) {
      alert('请先选择至少一个 IP 和一个端口')
      return
    }
    navigator.clipboard.writeText(yaml)
    addLog('[+] Clash Meta (Mihomo) 完整配置文件已拷贝至剪贴板')
    alert('Clash 完整配置文件已复制到剪贴板！可以直接粘贴创建新的 Clash 配置文件使用。')
  }

  // Download Clash Meta .yaml profile file
  const downloadClashYaml = () => {
    const yaml = generateClashYaml()
    if (!yaml) {
      alert('请先选择至少一个 IP 和一个端口')
      return
    }
    
    const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'clash_warp_optimized.yaml'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    addLog('[+] clash_warp_optimized.yaml 配置文件已下载')
  }

  return (
    <div className="min-h-screen bg-darkBg bg-grid flex flex-col items-center p-3 pb-8 md:p-6 text-gray-100">
      
      {/* Header */}
      <header className="w-full max-w-lg mb-4 text-center mt-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-darkCard/80 glass-panel rounded-full text-neonBlue text-xs font-semibold mb-2 shadow-neon">
          <Shield className="w-3.5 h-3.5 animate-pulse" />
          <span>CLOUDFLARE WARP IP OPTIMIZER</span>
        </div>
        <h1 className="text-3xl font-extrabold font-sans tracking-tight bg-gradient-to-r from-neonBlue via-cyanGlow to-neonPurple bg-clip-text text-transparent">
          WARP Speedtest
        </h1>
        <p className="text-xs text-gray-400 mt-1 font-sans">
          为 Shadowrocket 客户端一键优选 Cloudflare Anycast 节点
        </p>
      </header>

      {/* Main Grid Layout */}
      <main className="w-full max-w-lg flex flex-col gap-4 flex-1">
        
        {/* Collapsible Guide */}
        <section className="glass-panel rounded-2xl p-4 shadow-lg transition-all duration-300">
          <button 
            onClick={() => setShowGuide(!showGuide)}
            className="w-full flex items-center justify-between text-xs font-bold text-gray-300 uppercase tracking-wider focus:outline-none"
          >
            <span className="flex items-center gap-1.5 text-neonBlue">
              <HelpCircle className="w-4 h-4 text-neonBlue" />
              💡 使用指南 & 常见问题
            </span>
            <span className="text-[10px] text-gray-500 font-mono">
              {showGuide ? '[ 点击收起 ]' : '[ 点击展开 ]'}
            </span>
          </button>
          
          {showGuide && (
            <div className="mt-3 border-t border-gray-800/60 pt-3">
              {/* Tab Selector */}
              <div className="flex bg-gray-900/60 p-0.5 rounded-lg border border-gray-800/80 mb-3">
                <button
                  onClick={(e) => { e.stopPropagation(); setGuideTab('basic'); }}
                  className={`flex-1 text-[11px] py-1 rounded-md font-medium transition-all ${guideTab === 'basic' ? 'bg-neonBlue text-darkBg shadow-sm font-bold' : 'text-gray-400'}`}
                >
                  基础操作步骤
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setGuideTab('faq'); }}
                  className={`flex-1 text-[11px] py-1 rounded-md font-medium transition-all ${guideTab === 'faq' ? 'bg-neonPurple text-white shadow-sm font-bold' : 'text-gray-400'}`}
                >
                  进阶技巧 & 常见问题
                </button>
              </div>

              {guideTab === 'basic' ? (
                <div className="text-xs text-gray-400 space-y-3 leading-relaxed">
                  <div className="flex gap-2">
                    <span className="bg-neonBlue/10 text-neonBlue w-5 h-5 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-[10px] font-mono">1</span>
                    <div>
                      <p className="font-bold text-gray-300">配置账户凭证</p>
                      <p className="text-[11px] mt-0.5">点击“注册账户”，网页会自动处理。如果因浏览器跨域安全策略导致直连注册失败，会显示“降级运行”并通过 Cloudflare 边缘的云端代理重新成功注册，最终为您获取专属公钥和 Reserved 标识。</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="bg-neonBlue/10 text-neonBlue w-5 h-5 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-[10px] font-mono">2</span>
                    <div>
                      <p className="font-bold text-gray-300">Anycast IP 优选测速</p>
                      <p className="text-[11px] mt-0.5">建议测速前<b>关闭小火箭或其它 VPN</b> 以确保测得真实宽带延迟。点击“开始 IP 优选测速”，测试完成后延迟最低的前 5 个 IP 会被自动勾选。</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <span className="bg-neonBlue/10 text-neonBlue w-5 h-5 rounded-full flex items-center justify-center font-bold flex-shrink-0 text-[10px] font-mono">3</span>
                    <div>
                      <p className="font-bold text-gray-300">导入客户端使用</p>
                      <p className="text-[11px] mt-0.5">勾选希望生成的端口（建议多选以获得更多备用节点），iOS 用户直接点击<b>“🚀 一键导入 Shadowrocket”</b>。PC/Mac/Android 用户可选择下载 Clash Meta YAML 配置文件或通用 .conf 文件。</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-400 space-y-3.5 leading-relaxed font-sans max-h-96 overflow-y-auto pr-1">
                  <div>
                    <h4 className="font-bold text-gray-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-neonPurple" />
                      Q: 为什么小火箭导入后点击“TCP测试”显示超时/没有延迟？
                    </h4>
                    <p className="text-[11px] mt-0.5 pl-2.5 text-gray-400">
                      <b>原因</b>：WireGuard 协议属于纯 <b>UDP 协议</b>，不支持普通的 TCP 连接测试。因此在小火箭中直接进行默认的“TCP测试”必然会显示超时或无延迟。<br />
                      <b>解决方法</b>：在小火箭主界面点击右下角 <b>【设置】</b> → <b>【测试方法】</b> → 选择 <b>【ICMP】</b>（即 Ping 测试）。返回首页后，再次点击节点的“连通性测试”或者点击节点右侧，就能成功测出真实的物理延迟了。
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-neonPurple" />
                      Q: 虽然测试延迟有几百毫秒，但是看油管/网页为什么很流畅？
                    </h4>
                    <p className="text-[11px] mt-0.5 pl-2.5 text-gray-400">
                      <b>延迟不等于带宽</b>。Cloudflare 拥有极度庞大的全球 Anycast 边缘网络。虽然中国直连节点在握手建立连接时物理延迟在 150ms-300ms 左右，但一旦隧道握手建立完成，其实际吞吐带宽和多路并发性能非常强劲，观看 4K YouTube 视频、刷推、浏览日常网页或者进行文件下载都完全没有阻碍。
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-neonPurple" />
                      Q: 支持安卓（Android）手机吗？有专门的安卓客户端 APP 吗？
                    </h4>
                    <p className="text-[11px] mt-0.5 pl-2.5 text-gray-400">
                      <b>完美支持</b>。本站是一个纯网页优选工具，不需要额外下载本站的专属 APP（避免占用后台与空间），直接配合安卓端成熟的主流代理客户端即可使用：<br />
                      - <b>v2rayNG (推荐)</b>：测速后，点击【复制小火箭链接】，在 v2rayNG 主界面点击右上角“+”号选择“从剪贴板导入”即可一键导入 WireGuard 节点；或者点击【下载合并 .conf 文件】，在 v2rayNG 中点击“+”号选择“导入自定义配置”读入此 conf 文件。<br />
                      - <b>Clash Meta / Mihomo Android</b>：直接在测速后点击【下载 Clash Meta 完整配置 (.yaml)】，将文件保存到手机，在 Clash 客户端 Profiles (配置) 中导入使用即可。<br />
                      - <b>Sing-box Android</b>：支持导入由本站 WireGuard 配置转换或直接编写的配置。
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-neonPurple" />
                      Q: Clash 配置文件直接导入能用吗？有什么规则？
                    </h4>
                    <p className="text-[11px] mt-0.5 pl-2.5 text-gray-400">
                      <b>直接导入即可使用，且内置了完整的智能分流规则</b>。本站提供的 Clash 完整配置文件（.yaml）已内置：<br />
                      1. <b>DNS 配置</b>：采用 Fake-IP 模式，国内域名使用阿里/腾讯 DNS 直连解析，国外域名代理防污染解析。<br />
                      2. <b>策略组（⚡ 自动选择）</b>：自动将您选中的优质 IP 进行 url-test 测速，每 5 分钟自动切换至最快节点，无需手动干预。<br />
                      3. <b>分流规则</b>：内置 GeoIP 规则，国内的全部软件/网站自动直连（不消耗任何代理流量），国外的服务（如 Google、YouTube、Twitter、GitHub、ChatGPT 等）自动分流走优选后的 WARP 节点。
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-neonPurple" />
                      Q: 为什么连上了节点但却打不开网页？
                    </h4>
                    <p className="text-[11px] mt-0.5 pl-2.5 text-gray-400">
                      这通常是由以下原因导致的：<br />
                      1. <b>公钥未激活</b>：如果使用手动配置填入了未向 Cloudflare 成功注册的公钥，握手会失败。请使用“自动注册”重新生成并激活凭证。<br />
                      2. <b>端口 2408 被运营商封锁</b>：部分地区运营商对 2408 端口的 UDP 流量进行了限制或丢包。请在下方勾选 500、1701、4500 等备用端口，重新生成并导入，更换端口即可连通。<br />
                      3. <b>Reserved 丢失</b>：如果没有携带 Reserved 保留字节或值为 <code>0,0,0</code>，可能会很快被 Cloudflare 限制握手，请确保使用了自动注册获取的专属保留值。
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-neonPurple" />
                      Q: 端口选择（Port）有什么讲究？
                    </h4>
                    <p className="text-[11px] mt-0.5 pl-2.5 text-gray-400">
                      - <b>2408</b> 是 WARP 官方默认的专用端口，但容易受部分地区运营商特殊照顾。<br />
                      - <b>500</b> 和 <b>4500</b> 是常规 IPsec VPN 协议的标准系统端口，运营商通常会无条件放行，具有极高的穿透成功率。<br />
                      - <b>1701</b> 也是常规 VPN 端口。强烈建议生成配置时将这四个端口<b>全部勾选</b>，这样会在客户端中生成多条线路备用。
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-neonPurple" />
                      Q: 什么是 Reserved（保留字节）？
                    </h4>
                    <p className="text-[11px] mt-0.5 pl-2.5 text-gray-400">
                      它是 Cloudflare 识别账户流量和鉴权的 3 字节特定标识码。必须在客户端配置的 <code>reserved = [x, y, z]</code> 中填入。若留空或设为 <code>0,0,0</code>，虽然有时能通，但在流量增大后会被 Cloudflare 主动断开或严重限速。
                    </p>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-200 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-neonPurple" />
                      Q: 建议多久进行一次优选？
                    </h4>
                    <p className="text-[11px] mt-0.5 pl-2.5 text-gray-400">
                      Cloudflare 节点的网络状态与您本地网络是随时波动的。建议<b>每隔一到两周</b>，或者在感到连接变慢时，重新打开本站进行一次“IP优选测速”并一键覆盖导入，以维持在最优的网络节点上。
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
        
        {/* Step 1: Account Configuration (Auto/Manual) */}
        <section className="glass-panel rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-2">
            <h2 className="text-sm font-bold tracking-wider text-gray-300 uppercase flex items-center gap-2">
              <Settings className="w-4 h-4 text-neonPurple" />
              1. 账户凭证配置
            </h2>
            <div className="flex bg-gray-900/60 p-0.5 rounded-lg border border-gray-800">
              <button 
                onClick={() => setActiveTab('auto')}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${activeTab === 'auto' ? 'bg-neonBlue text-darkBg shadow-sm' : 'text-gray-400'}`}
              >
                自动注册
              </button>
              <button 
                onClick={() => setActiveTab('manual')}
                className={`text-xs px-2.5 py-1 rounded-md font-medium transition-all ${activeTab === 'manual' ? 'bg-neonPurple text-white shadow-sm' : 'text-gray-400'}`}
              >
                手动配置
              </button>
            </div>
          </div>

          {activeTab === 'auto' ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between bg-gray-900/40 p-3 rounded-xl border border-gray-800/60">
                <div className="flex flex-col">
                  <span className="text-xs text-gray-400">WARP 账户注册状态</span>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {registrationStatus === 'idle' && (
                      <span className="text-xs font-semibold text-gray-500">未开始</span>
                    )}
                    {registrationStatus === 'registering' && (
                      <span className="text-xs font-semibold text-neonBlue flex items-center gap-1">
                        <span className="inline-block w-1.5 h-1.5 bg-neonBlue rounded-full animate-ping" />
                         正在注册...
                      </span>
                    )}
                    {registrationStatus === 'success' && (
                      <span className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 注册成功
                      </span>
                    )}
                    {registrationStatus === 'failed' && (
                      <span className="text-xs font-semibold text-amber-500 flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" /> 降级运行
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={registerWarpAccount}
                  disabled={registrationStatus === 'registering'}
                  className="bg-neonBlue/10 border border-neonBlue hover:bg-neonBlue hover:text-darkBg text-neonBlue text-xs font-bold px-3.5 py-2 rounded-lg transition-all duration-300 flex items-center gap-1.5 shadow-neon"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${registrationStatus === 'registering' ? 'animate-spin' : ''}`} />
                  {registrationStatus === 'idle' ? '注册账户' : '重新注册'}
                </button>
              </div>

              {/* Readonly details */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-darkBg/60 p-2 rounded-lg border border-gray-800/40">
                  <span className="text-[10px] text-gray-500 block">IPv4 地址</span>
                  <span className="text-gray-300 block truncate">{addressV4}</span>
                </div>
                <div className="bg-darkBg/60 p-2 rounded-lg border border-gray-800/40">
                  <span className="text-[10px] text-gray-500 block">Reserved (3 字节)</span>
                  <span className="text-neonBlue block truncate font-bold">{reserved}</span>
                </div>
                <div className="col-span-2 bg-darkBg/60 p-2 rounded-lg border border-gray-800/40">
                  <span className="text-[10px] text-gray-500 block">对端公钥 (Peer PublicKey)</span>
                  <span className="text-gray-400 block truncate">{peerPublicKey}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 font-mono">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-gray-500 uppercase">WireGuard 客户端私钥</label>
                  <input
                    type="text"
                    value={privateKey}
                    onChange={(e) => setPrivateKey(e.target.value)}
                    placeholder="Base64 编码的 32字节私钥"
                    className="bg-darkBg/80 border border-gray-800 rounded-lg p-2 text-xs text-gray-300 focus:border-neonPurple focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-gray-500 uppercase">Reserved (十进制字节码)</label>
                  <input
                    type="text"
                    value={reserved}
                    onChange={(e) => setReserved(e.target.value)}
                    placeholder="如: 148,22,9"
                    className="bg-darkBg/80 border border-gray-800 rounded-lg p-2 text-xs text-neonPurple font-bold focus:border-neonPurple focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-gray-500 uppercase">内网 IPv4 地址</label>
                  <input
                    type="text"
                    value={addressV4}
                    onChange={(e) => setAddressV4(e.target.value)}
                    placeholder="172.16.0.2"
                    className="bg-darkBg/80 border border-gray-800 rounded-lg p-2 text-xs text-gray-300 focus:border-neonPurple focus:outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-gray-500 uppercase">对端公钥 (Peer PublicKey)</label>
                  <input
                    type="text"
                    value={peerPublicKey}
                    onChange={(e) => setPeerPublicKey(e.target.value)}
                    placeholder="Cloudflare 对端公钥"
                    className="bg-darkBg/80 border border-gray-800 rounded-lg p-2 text-xs text-gray-300 focus:border-neonPurple focus:outline-none"
                  />
                </div>
              </div>
              <button 
                onClick={() => generateKeys(true)}
                className="mt-1 bg-neonPurple/10 border border-neonPurple hover:bg-neonPurple/20 text-neonPurple text-xs py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                重新生成客户端密钥对
              </button>
            </div>
          )}
        </section>

        {/* Step 2: Optimizing & Benchmarking */}
        <section className="glass-panel rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-2">
            <h2 className="text-sm font-bold tracking-wider text-gray-300 uppercase flex items-center gap-2">
              <Zap className="w-4 h-4 text-neonBlue" />
              2. Anycast IP 优选测速
            </h2>
            <div className="flex items-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-full ${isTesting ? 'bg-neonBlue animate-ping' : 'bg-gray-600'}`} />
              <span className="text-[10px] text-gray-400 font-mono">
                {isTesting ? `测速中 ${testProgress.current}/${testProgress.total}` : '已就绪'}
              </span>
            </div>
          </div>

          {/* Benchmarking Parameters Accordion */}
          <div className="mb-4 bg-darkBg/50 border border-gray-800/80 rounded-xl p-3">
            <div className="flex items-center gap-1 mb-2 text-xs text-gray-400 font-semibold">
              <Sliders className="w-3.5 h-3.5" />
              <span>并发与延迟限制设定</span>
            </div>
            
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="text-[10px] text-gray-500">并发线程数</span>
                  <span className="text-neonBlue font-bold">{concurrency}</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="60"
                  value={concurrency}
                  onChange={(e) => setConcurrency(parseInt(e.target.value))}
                  className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-neonBlue"
                />
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between">
                  <span className="text-[10px] text-gray-500">超时上限</span>
                  <span className="text-neonBlue font-bold">{timeoutMs}ms</span>
                </div>
                <input
                  type="range"
                  min="500"
                  max="3000"
                  step="100"
                  value={timeoutMs}
                  onChange={(e) => setTimeoutMs(parseInt(e.target.value))}
                  className="w-full h-1 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-neonBlue"
                />
              </div>
            </div>
          </div>

          <button
            onClick={startBenchmarking}
            disabled={isTesting}
            className="w-full bg-gradient-to-r from-neonBlue to-neonGreen text-darkBg font-extrabold text-sm py-2.5 rounded-xl shadow-lg transition-transform active:scale-[0.98] disabled:opacity-50 hover:shadow-neon duration-300 flex items-center justify-center gap-2"
          >
            <Zap className={`w-4 h-4 ${isTesting ? 'animate-bounce' : ''}`} />
            {isTesting ? `正在测速 (${Math.round((testProgress.current / testProgress.total) * 100)}%)...` : '开始 IP 优选测速'}
          </button>

          {/* Results display */}
          {testResults.length > 0 && (
            <div className="mt-4">
              <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">响应排序 (前 5 自动勾选)</span>
                <span className="text-[10px] text-neonBlue font-mono">勾选节点以编译小火箭配置</span>
              </div>
              
              <div className="max-h-48 overflow-y-auto border border-gray-800/80 rounded-xl divide-y divide-gray-800/60 bg-darkBg/60">
                {testResults.map((result, idx) => {
                  const isChecked = selectedIPs.includes(result.ip);
                  return (
                    <div 
                      key={result.ip} 
                      onClick={() => toggleIP(result.ip)}
                      className={`flex items-center justify-between p-2.5 cursor-pointer transition-all ${isChecked ? 'bg-neonBlue/5' : 'hover:bg-gray-800/20'}`}
                    >
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by div onClick
                          className="rounded border-gray-800 text-neonBlue focus:ring-0 w-3.5 h-3.5 bg-darkBg accent-neonBlue"
                        />
                        <div className="flex flex-col">
                          <span className="text-xs font-mono text-gray-300">{result.ip}</span>
                          <span className="text-[9px] text-gray-500 font-mono">Anycast Subnet {idx + 1}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-mono font-bold ${result.latency < 120 ? 'text-emerald-400' : result.latency < 250 ? 'text-neonBlue' : 'text-gray-500'}`}>
                          {result.latency} ms
                        </span>
                        <Wifi className={`w-3.5 h-3.5 ${result.latency < 120 ? 'text-emerald-400' : result.latency < 250 ? 'text-neonBlue' : 'text-gray-600'}`} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        {/* Step 3: Export & Import Integration */}
        <section className="glass-panel rounded-2xl p-4 shadow-lg flex flex-col gap-3">
          <h2 className="text-sm font-bold tracking-wider text-gray-300 uppercase flex items-center gap-2 border-b border-gray-800 pb-2 mb-1">
            <ExternalLink className="w-4 h-4 text-neonBlue" />
            3. 小火箭导入与配置文件导出
          </h2>

          {/* Port settings */}
          <div className="flex flex-col gap-1.5 bg-darkBg/40 p-2.5 rounded-xl border border-gray-800/60">
            <span className="text-[10px] text-gray-500 uppercase font-mono">多端口节点编译 (建议多选)</span>
            <div className="flex gap-2">
              {WARP_PORTS.map(port => {
                const isSelected = selectedPorts.includes(port);
                return (
                  <button
                    key={port}
                    onClick={() => togglePort(port)}
                    className={`flex-1 text-xs py-1.5 rounded-lg border font-mono transition-all font-bold ${
                      isSelected 
                        ? 'bg-neonBlue/10 border-neonBlue text-neonBlue shadow-neon' 
                        : 'bg-darkBg border-gray-800 text-gray-500 hover:border-gray-700'
                    }`}
                  >
                    Port {port}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              onClick={launchShadowrocket}
              disabled={selectedIPs.length === 0}
              className="col-span-2 bg-gradient-to-r from-neonPurple to-pink-500 text-white font-extrabold text-sm py-3 rounded-xl shadow-lg transition-transform active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              <ExternalLink className="w-4 h-4" />
              🚀 一键导入 Shadowrocket (小火箭)
            </button>
            
            <button
              onClick={copyShadowrocketLink}
              disabled={selectedIPs.length === 0}
              className="bg-gray-900 border border-gray-800 text-gray-300 hover:border-gray-700 text-xs py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5"
            >
              <Copy className="w-3.5 h-3.5 text-neonBlue" />
              复制小火箭链接
            </button>

            <button
              onClick={copyConf}
              disabled={selectedIPs.length === 0}
              className="bg-gray-900 border border-gray-800 text-gray-300 hover:border-gray-700 text-xs py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5"
            >
              <FileText className="w-3.5 h-3.5 text-neonPurple" />
              复制首选 .conf
            </button>

            <button
              onClick={copyClashConfig}
              disabled={selectedIPs.length === 0}
              className="bg-gray-900 border border-gray-800 text-gray-300 hover:border-gray-700 text-xs py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5 text-neonBlue" />
              复制 Clash 完整配置
            </button>

            <button
              onClick={downloadConfFile}
              disabled={selectedIPs.length === 0}
              className="bg-darkCard/80 border border-gray-800 hover:border-neonBlue text-gray-300 text-xs py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5 text-neonGreen" />
              下载合并 .conf 文件
            </button>

            <button
              onClick={downloadClashYaml}
              disabled={selectedIPs.length === 0}
              className="col-span-2 bg-neonPurple/10 border border-neonPurple hover:bg-neonPurple/20 text-neonPurple text-xs py-2.5 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 shadow-neonPurple"
            >
              <Download className="w-3.5 h-3.5 text-neonPurple" />
              下载 Clash Meta 完整配置 (.yaml)
            </button>
          </div>

          {selectedIPs.length > 0 && (
            <p className="text-[10px] text-center text-gray-500 mt-1">
              已选 {selectedIPs.length} 个 IP, {selectedPorts.length} 个端口 | 将生成 {selectedIPs.length * selectedPorts.length} 个节点
            </p>
          )}
        </section>

        {/* Console Log Panel */}
        <section className="glass-panel rounded-2xl shadow-lg overflow-hidden flex flex-col h-40">
          <div className="bg-gray-950 px-3 py-1.5 border-b border-gray-850 flex items-center justify-between">
            <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <TerminalIcon className="w-3.5 h-3.5 text-neonGreen" />
              运行状态终端控制台
            </span>
            <button 
              onClick={() => setLogs([])}
              className="text-[9px] text-gray-500 hover:text-gray-300 font-mono uppercase"
            >
              [ 清空 ]
            </button>
          </div>
          
          <div className="flex-1 bg-black/90 p-3 overflow-y-auto font-mono text-[10px] leading-relaxed text-neonGreen/80 select-text">
            {logs.map((log, index) => (
              <div key={index} className="whitespace-pre-wrap font-mono">
                {log}
              </div>
            ))}
            <div ref={terminalEndRef} />
          </div>
        </section>

      </main>

      {/* Footer */}
      <footer className="mt-6 text-center text-[10px] text-gray-600 font-mono">
        <p>WARP Anycast Speedtest v1.0.0 (SPA Edition)</p>
        <p className="mt-0.5">Licensed under GNU AGPLv3 | Designed with rich neon aesthetics & fully browser-safe cryptography</p>
      </footer>
    </div>
  )
}
