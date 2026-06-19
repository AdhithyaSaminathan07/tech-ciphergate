import re

with open('frontend/src/components/admin/SecondBrainAdmin.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace import
content = content.replace(
    "import { FaPlus, FaTrash, FaEdit, FaSearch, FaBook, FaBrain, FaSync, FaTags, FaStickyNote, FaHistory } from 'react-icons/fa';",
    "import { Plus, Trash2, Edit2, Search, Book, Brain, RefreshCw, Tags, StickyNote, History } from 'lucide-react';"
)

# Replace icon components
replacements = {
    'FaPlus': 'Plus',
    'FaTrash': 'Trash2',
    'FaEdit': 'Edit2',
    'FaSearch': 'Search',
    'FaBook': 'Book',
    'FaBrain': 'Brain',
    'FaSync': 'RefreshCw',
    'FaTags': 'Tags',
    'FaStickyNote': 'StickyNote',
    'FaHistory': 'History'
}

for fa, lucide in replacements.items():
    content = re.sub(r'<' + fa + r'(\s|>)', r'<' + lucide + r'\1', content)

with open('frontend/src/components/admin/SecondBrainAdmin.jsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('Icons updated successfully!')
