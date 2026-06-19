import os
import re

directory = 'src'

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    def replace_uppercase(match):
        inner = match.group(1)
        inner = re.sub(r'\buppercase\b', '', inner)
        inner = re.sub(r'\s+', ' ', inner).strip()
        return f'className="{inner}"'

    def replace_uppercase_backticks(match):
        inner = match.group(1)
        inner = re.sub(r'\buppercase\b', '', inner)
        inner = re.sub(r'\s+', ' ', inner).strip()
        return f'className={{`{inner}`}}'

    # Match className="..."
    new_content = re.sub(r'className="([^"]+)"', replace_uppercase, content)
    # Match className={`...`}
    new_content = re.sub(r'className=\{\`([^\`]+)\`\}', replace_uppercase_backticks, new_content)

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        return True
    return False

modified_count = 0
for root, _, files in os.walk(directory):
    for file in files:
        if file.endswith('.jsx') or file.endswith('.js'):
            filepath = os.path.join(root, file)
            if process_file(filepath):
                modified_count += 1
                print(f"Modified: {filepath}")

print(f"Total files modified: {modified_count}")
