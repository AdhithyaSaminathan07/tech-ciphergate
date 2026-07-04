import React from 'react';
import DOMPurify from 'dompurify';

const SafeHTML = ({ html, className = '' }) => {
    // Sanitize the HTML string to prevent XSS attacks
    const sanitizedHtml = DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
            'b', 'i', 'em', 'strong', 'a', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
            'ul', 'ol', 'li', 'br', 'span', 'div', 'code', 'pre', 'blockquote'
        ],
        ALLOWED_ATTR: ['href', 'class', 'target', 'rel']
    });

    return (
        <div 
            className={className} 
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }} 
        />
    );
};

export default SafeHTML;
