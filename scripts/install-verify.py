# -*- coding: utf-8 -*-
"""影子剪纸机 安装/卸载验收（参照 18-新产品开发与验收规范 第六节清单）。
reg.exe 被本机安全策略禁止，注册表读写用 winreg。"""
import ctypes
import os
import shutil
import subprocess
import sys
import time
import winreg

SETUP_SRC = r"X:\shadow-craft\out\make\squirrel.windows\x64\ShadowCraft-0.1.0 Setup.exe"
SETUP_DST = os.path.join(os.environ["TEMP"], "ShadowCraftSetup.exe")
APP_DIR = os.path.join(os.environ["LOCALAPPDATA"], "ShadowCraft")
LNK = os.path.join(os.environ["APPDATA"], r"Microsoft\Windows\Start Menu\Programs", "影子剪纸机.lnk")
TITLE = "影子剪纸机"

def step(msg): print(f"[check] {msg}", flush=True)

results = []
def record(name, ok, detail):
    results.append((name, ok, detail))
    print(f"{'PASS' if ok else 'FAIL'} | {name} | {detail}", flush=True)

env = {k: v for k, v in os.environ.items() if k not in ("ELECTRON_RUN_AS_NODE", "NODE_OPTIONS")}

step("复制安装包到 ASCII 路径")
shutil.copyfile(SETUP_SRC, SETUP_DST)
record("Setup.exe 可访问", os.path.getsize(SETUP_DST) > 100_000_000, f"{os.path.getsize(SETUP_DST)} 字节")

step("静默安装")
proc = subprocess.run([SETUP_DST, "--silent"], env=env, capture_output=True, text=True, timeout=300)
record("安装退出码 0", proc.returncode == 0, f"exit={proc.returncode}")
time.sleep(2)
app_ver = os.path.join(APP_DIR, "app-0.1.0")
record("安装目录与 app-0.1.0 存在", os.path.isdir(app_ver), app_ver)
record("主程序存在", os.path.isfile(os.path.join(app_ver, "ShadowCraft.exe")), "")

def find_uninstall_key():
    root = winreg.HKEY_CURRENT_USER
    path = r"Software\Microsoft\Windows\CurrentVersion\Uninstall"
    hits = []
    with winreg.OpenKey(root, path) as key:
        for i in range(winreg.QueryInfoKey(key)[0]):
            sub = winreg.EnumKey(key, i)
            try:
                with winreg.OpenKey(root, path + "\\" + sub) as k:
                    name, _ = winreg.QueryValueEx(k, "DisplayName")
                    if "影子" in str(name) or "ShadowCraft" in sub:
                        ver, _ = winreg.QueryValueEx(k, "DisplayVersion") if True else ("", None)
                        hits.append((sub, str(name), str(ver)))
            except OSError:
                continue
    return hits

time.sleep(2)
hits = find_uninstall_key()
record("注册表卸载项", len(hits) == 1, str(hits))
record("开始菜单快捷方式", os.path.isfile(LNK), LNK)

step("从快捷方式启动并核对窗口标题（码位比对）")
proc = subprocess.Popen(["cmd", "/c", "start", "", LNK], env=env,
                        creationflags=subprocess.CREATE_NO_WINDOW)
hwnd = 0
for _ in range(30):
    time.sleep(1)
    hwnd = ctypes.windll.user32.FindWindowW(None, TITLE)
    if hwnd:
        break
record("窗口标题「影子剪纸机」", hwnd != 0,
       f"FindWindowW={'找到' if hwnd else '未找到'} 期望码位={[hex(ord(c)) for c in TITLE]}")
subprocess.run(["taskkill", "/F", "/IM", "ShadowCraft.exe"], capture_output=True)
time.sleep(2)

step("卸载")
upd = os.path.join(APP_DIR, "Update.exe")
proc = subprocess.run([upd, "--uninstall"], env=env, capture_output=True, text=True, timeout=300)
record("卸载退出码 0", proc.returncode == 0, f"exit={proc.returncode}")
time.sleep(3)
record("注册表卸载项已清除", len(find_uninstall_key()) == 0, "")
record("开始菜单快捷方式已删除", not os.path.isfile(LNK), "")
residue = []
if os.path.isdir(APP_DIR):
    residue = os.listdir(APP_DIR)
record("残留仅为 Squirrel 固有项", all(x in (".dead", "Update.exe", "squirrel.exe") or x.startswith("app-") and os.path.isdir(os.path.join(APP_DIR, x, "squirrel.exe")) or x in (".dead", "Update.exe") for x in residue), str(residue))

print("\n===== 验收汇总 =====")
fails = [r for r in results if not r[1]]
for name, ok, detail in results:
    print(("PASS" if ok else "FAIL"), "|", name)
print(f"\n{len(results) - len(fails)}/{len(results)} 项通过")
sys.exit(1 if fails else 0)
