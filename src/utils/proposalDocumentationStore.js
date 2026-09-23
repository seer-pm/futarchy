let proposalDocumentationData = null;

export const setProposalDocumentationData = (data) => {
  console.log('Raw topics data received:', data.topics.map(t => ({
    id: t.id,
    content: t.content
  })));

  // Convert HTML content to markdown-like format
  const convertToMarkdown = (htmlContent, topicNumber) => {
    console.log('Converting HTML content:', htmlContent);
    
    // First ensure there's a section header
    const sectionHeader = `### Section ${topicNumber}\n`;
    
    const converted = htmlContent
      .replace(/<h[1-6]>/g, '') // Remove any existing headers
      .replace(/<\/h[1-6]>/g, '\n')
      .replace(/<ul>/g, '')
      .replace(/<\/ul>/g, '')
      .replace(/<ol>/g, '')
      .replace(/<\/ol>/g, '')
      .replace(/<li>/g, '- ')
      .replace(/<\/li>/g, '\n')
      .replace(/<p>/g, '')
      .replace(/<\/p>/g, '\n\n')
      .replace(/&nbsp;/g, ' ')
      .trim();
    
    // Combine section header with converted content
    const finalContent = `${sectionHeader}${converted}`;
    
    console.log('After conversion to markdown:', finalContent);
    return finalContent;
  };

  // Transform the topics content into the expected markdown structure
  const markdownContent = data.topics.map((topic, index) => {
    console.log(`Converting topic ${index + 1}:`, topic.content);
    const convertedContent = convertToMarkdown(topic.content, index + 1);
    console.log(`Topic ${index + 1} after conversion:`, convertedContent);
    return convertedContent;
  }).join('\n\n');

  console.log('Final combined markdown content:', markdownContent);

  proposalDocumentationData = {
    proposalId: "USER-1",
    company: {
      name: "User Created Proposal",
      logo: "/assets/seer-logo.svg",
      description: "User generated proposal documentation",
      tokens: ["USER"],
      status: "Draft"
    },
    heroContent: {
      title: data.title || "Untitled Proposal",
      description: "User created proposal documentation",
      image: "/assets/protocol-upgrade-banner.png"
    },
    timestamp: Date.now() / 1000,
    endTime: Date.now() / 1000 + 86400 * 5,
    marketOverview: {
      status: "Draft",
      prices: {
        approval: "$0.00",
        refusal: "$0.00"
      },
      totalVolume: "$0"
    },
    content: markdownContent
  };

  console.log('Final stored proposal data:', proposalDocumentationData);
};

export const getProposalDocumentationData = () => {
  return proposalDocumentationData;
}; 