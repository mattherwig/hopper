import Darwin

/// A process, as returned to TypeScript. Agent sources use this to tell live agents from leftovers, find the
/// terminal an agent runs in (its tty and parent chain), and spot agent CLIs by name.
struct RunningProcess: Codable {
  let pid: Int
  let ppid: Int
  /// Controlling terminal without "/dev/" (e.g. "ttys003"), or "" for none.
  let tty: String
  /// Executable name (kernel `p_comm`, at most 16 characters), or for script interpreters (node, bun, python)
  /// the file name of the script they run, so `codex` or `gemini` installed through npm are recognized.
  let name: String
  /// Start time, milliseconds since 1970: with the pid it identifies a process (pids get reused).
  let startedAt: Double
  /// Working directory, for processes with a terminal only (agents' projects); "" otherwise or if unreadable.
  let cwd: String
}

private let interpreters: Set<String> = ["node", "bun", "deno", "python", "python3", "ruby"]

/// Every process, from one sysctl read (a few ms; no permissions needed). All users', not just ours: a terminal's
/// `login` runs as root, and parent chains from an agent to its terminal app go through it.
func readProcesses() -> [RunningProcess] {
  var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_ALL, 0]
  var size = 0
  guard sysctl(&mib, UInt32(mib.count), nil, &size, nil, 0) == 0 else { return [] }
  // Room for processes started between the two calls.
  size += size / 8
  let capacity = size / MemoryLayout<kinfo_proc>.stride
  var procs = [kinfo_proc](repeating: kinfo_proc(), count: capacity)
  guard sysctl(&mib, UInt32(mib.count), &procs, &size, nil, 0) == 0 else { return [] }
  let count = size / MemoryLayout<kinfo_proc>.stride

  return procs.prefix(count).map { proc in
    let pid = Int(proc.kp_proc.p_pid)
    var comm = proc.kp_proc.p_comm
    let command = withUnsafeBytes(of: &comm) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
    let start = proc.kp_proc.p_starttime
    let tty = ttyName(proc.kp_eproc.e_tdev)
    return RunningProcess(
      pid: pid,
      ppid: Int(proc.kp_eproc.e_ppid),
      tty: tty,
      name: interpreters.contains(command) ? (scriptName(pid: pid) ?? command) : command,
      startedAt: Double(start.tv_sec) * 1000 + Double(start.tv_usec) / 1000,
      cwd: tty.isEmpty ? "" : (workingDirectory(pid: pid) ?? "")
    )
  }
}

private func workingDirectory(pid: Int) -> String? {
  var info = proc_vnodepathinfo()
  let size = Int32(MemoryLayout<proc_vnodepathinfo>.size)
  guard proc_pidinfo(Int32(pid), PROC_PIDVNODEPATHINFO, 0, &info, size) == size else { return nil }
  let path = withUnsafeBytes(of: &info.pvi_cdir.vip_path) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
  return path.isEmpty ? nil : path
}

private func ttyName(_ device: dev_t) -> String {
  guard device != -1, let name = devname(device, S_IFCHR) else { return "" }
  let text = String(cString: name)
  return text == "??" ? "" : text
}

/// File name of the script an interpreter runs: the first argument not starting with "-". Only that name
/// leaves this function; other arguments can hold secrets and are never returned.
private func scriptName(pid: Int) -> String? {
  var mib: [Int32] = [CTL_KERN, KERN_PROCARGS2, Int32(pid)]
  var size = 0
  guard sysctl(&mib, 3, nil, &size, nil, 0) == 0, size > 0 else { return nil }
  var buffer = [UInt8](repeating: 0, count: size)
  guard sysctl(&mib, 3, &buffer, &size, nil, 0) == 0, size > MemoryLayout<Int32>.size else { return nil }
  // Layout: argc (Int32), executable path, NUL padding, then argv[0], argv[1], ... NUL-separated.
  let argc = buffer.withUnsafeBytes { $0.load(as: Int32.self) }
  var index = MemoryLayout<Int32>.size
  while index < size && buffer[index] != 0 { index += 1 }
  while index < size && buffer[index] == 0 { index += 1 }
  var args: [String] = []
  while index < size && args.count < Int(argc) {
    let start = index
    while index < size && buffer[index] != 0 { index += 1 }
    args.append(String(decoding: buffer[start..<index], as: UTF8.self))
    index += 1
  }
  guard let script = args.dropFirst().first(where: { !$0.hasPrefix("-") }) else { return nil }
  return script.split(separator: "/").last.map(String.init)
}
