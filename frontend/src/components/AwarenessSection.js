// AwarenessSection.js - Fixed version with working pledge and improved buttons
import React, { useState } from 'react';
import { Container, Row, Col, Card, Button, Modal, Form } from 'react-bootstrap';
import { 
  FaExclamationTriangle, 
  FaCar, 
  FaUserShield, 
  FaChartLine,
  FaAmbulance,
  FaShieldAlt,
  FaFireExtinguisher,
  FaTrafficLight,
  FaCheckCircle,
  FaTimesCircle,
  FaInfoCircle,
  FaStar,
  FaHeart,
  FaHandsHelping,
  FaCertificate,
  FaArrowRight,
  FaExternalLinkAlt
} from 'react-icons/fa';
import './AwarenessSection.css';

const AwarenessSection = () => {
  const [showPledgeModal, setShowPledgeModal] = useState(false);
  const [showCertificateModal, setShowCertificateModal] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [selectedTip, setSelectedTip] = useState(null);
  const [pledgeForm, setPledgeForm] = useState({
    name: '',
    email: '',
    agree: false
  });
  const [hasPledged, setHasPledged] = useState(false);
  const [pledgeId, setPledgeId] = useState('');

  const stats = [
    { 
      icon: <FaExclamationTriangle />, 
      number: '1.5L+', 
      label: 'Annual Road Deaths in India',
      type: 'danger'
    },
    { 
      icon: <FaCar />, 
      number: '70%', 
      label: 'Accidents due to Overspeeding',
      type: 'warning'
    },
    { 
      icon: <FaUserShield />, 
      number: '80%', 
      label: 'Helmet Saves Lives',
      type: 'success'
    },
    { 
      icon: <FaChartLine />, 
      number: '50%', 
      label: 'Reduction in Accidents with Awareness',
      type: 'info'
    }
  ];

  const safetyTips = [
    {
      id: 1,
      icon: '🪖',
      title: 'Always Wear Helmet',
      description: 'Helmets reduce the risk of head injury by 69% and death by 42%.',
      points: ['ISI Certified Helmet', 'Proper Strap Fastening', 'Replace after impact'],
      fine: '₹1,000',
      color: '#1a237e',
      detailedInfo: 'According to WHO, wearing a quality helmet reduces the risk of death by 42% and severe head injury by 69%. In India, two-wheeler riders without helmets account for over 30% of road fatalities. Always choose an ISI-certified helmet that fits properly and replace it every 3-5 years or after any impact.'
    },
    {
      id: 2,
      icon: '🔴',
      title: 'Stop at Red Light',
      description: 'Red light violations cause 22% of urban road accidents.',
      points: ['Complete Stop', 'Behind Stop Line', 'Wait for Green'],
      fine: '₹1,000 - ₹5,000',
      color: '#d32f2f',
      detailedInfo: 'Red light jumping is one of the leading causes of intersection crashes in India. According to the Ministry of Road Transport, over 15,000 accidents occur annually due to signal violations. Always stop behind the stop line, even if the road appears clear. Remember: A few seconds saved is never worth a life.'
    },
    {
      id: 3,
      icon: '🚫',
      title: "Don't Drink & Drive",
      description: 'Even small amounts of alcohol impair judgment and reaction time.',
      points: ['Plan Ahead', 'Use Cab Services', 'Designated Driver'],
      fine: '₹10,000 + 6 Months Prison',
      color: '#f57c00',
      detailedInfo: 'Drunk driving is responsible for over 12,000 deaths annually in India. Even at 0.03% BAC (well below the legal limit of 0.03%), reaction time is impaired by 12%. The legal consequences include fines up to ₹10,000 and/or imprisonment up to 6 months for first offense. Always designate a sober driver or use ride-sharing services.'
    },
    {
      id: 4,
      icon: '📵',
      title: 'No Mobile While Driving',
      description: 'Using mobile while driving increases crash risk by 400%.',
      points: ['Use Bluetooth', 'Pull Over to Answer', 'Keep Phone Silent'],
      fine: '₹5,000',
      color: '#0288d1',
      detailedInfo: 'Mobile phone use while driving increases crash risk by 4 times. Sending a text takes your eyes off the road for an average of 5 seconds - at 60 km/h, that\'s driving blind for the length of a football field. The Motor Vehicles Act imposes fines up to ₹5,000 for mobile phone use while driving. Use hands-free devices only when absolutely necessary.'
    }
  ];

  const emergencyContacts = [
    { icon: <FaAmbulance />, number: '108', name: 'AMBULANCE', color: 'emergency-ambulance' },
    { icon: <FaShieldAlt />, number: '100', name: 'POLICE', color: 'emergency-police' },
    { icon: <FaFireExtinguisher />, number: '101', name: 'FIRE', color: 'emergency-fire' },
    { icon: <FaTrafficLight />, number: '1033', name: 'TRAFFIC', color: 'emergency-traffic' }
  ];

  const handlePledgeSubmit = (e) => {
    e.preventDefault();
    
    // Generate a unique pledge ID
    const newPledgeId = 'RS' + Date.now().toString().slice(-8) + Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    setPledgeId(newPledgeId);
    
    // Set hasPledged to true
    setHasPledged(true);
    
    // Close pledge modal and open certificate modal
    setShowPledgeModal(false);
    setShowCertificateModal(true);
    
    // Optional: Save to localStorage or backend
    const pledgeData = {
      ...pledgeForm,
      pledgeId: newPledgeId,
      date: new Date().toISOString()
    };
    console.log('Pledge submitted:', pledgeData);
    localStorage.setItem('roadSafetyPledge', JSON.stringify(pledgeData));
  };

  const handleLearnMore = (tip) => {
    setSelectedTip(tip);
    setShowTipModal(true);
  };

  const handleEmergencyCall = (number) => {
    window.location.href = `tel:${number}`;
  };

  const resetPledgeForm = () => {
    setPledgeForm({
      name: '',
      email: '',
      agree: false
    });
  };

  const totalPledges = 15420;

  return (
    <section className="awareness-section py-5">
      <Container>
        {/* Header */}
        <div className="section-header text-center mb-5">
          <h1 className="section-title">
            <FaHandsHelping className="title-icon" />
            Road Safety Awareness
            <FaHeart className="title-icon" style={{ color: '#d32f2f' }} />
          </h1>
          <p className="section-subtitle">Your Safety is Our Priority - Know the Rules, Save Lives</p>
        </div>

        {/* Statistics Cards */}
        <Row className="g-4 mb-5">
          {stats.map((stat, index) => (
            <Col md={6} lg={3} key={index}>
              <Card className={`stat-card stat-${stat.type}`}>
                <Card.Body className="text-center">
                  <div className="stat-icon">{stat.icon}</div>
                  <h3 className="stat-number">{stat.number}</h3>
                  <p className="stat-label">{stat.label}</p>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>

        {/* Pledge Section */}
        <Row className="mb-5">
          <Col lg={12}>
            <Card className="pledge-card">
              <Card.Body>
                <Row className="align-items-center">
                  <Col lg={8}>
                    <div className="pledge-content">
                      <span className="pledge-badge">
                        <FaStar className="me-2" />
                        National Road Safety Mission
                      </span>
                      <h2 className="pledge-title">
                        Take the Road Safety Pledge
                        <FaHandsHelping className="ms-3" />
                      </h2>
                      <p className="pledge-text">
                        "I pledge to follow all traffic rules, wear helmet/seatbelt, 
                        never drink & drive, and be a responsible road user. 
                        Together, we can make Indian roads safer for everyone."
                      </p>
                      <div className="pledge-stats">
                        <div className="pledge-stat-item">
                          <FaUserShield className="stat-icon-small" />
                          <div>
                            <h4>{(totalPledges + (hasPledged ? 1 : 0)).toLocaleString()}+</h4>
                            <small>People Pledged</small>
                          </div>
                        </div>
                        <div className="pledge-stat-item">
                          <FaHeart className="stat-icon-small" style={{ color: '#ff4081' }} />
                          <div>
                            <h4>Join Them</h4>
                            <small>Make a Difference</small>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Col>
                  <Col lg={4}>
                    <div className="pledge-actions">
                      <Button 
                        variant="light" 
                        size="lg" 
                        className="pledge-btn"
                        onClick={() => {
                          resetPledgeForm();
                          setShowPledgeModal(true);
                        }}
                      >
                        <FaHandsHelping className="me-2" />
                        {hasPledged ? 'Take Pledge Again' : 'Take the Pledge Now'}
                      </Button>
                      {hasPledged && (
                        <Button 
                          variant="outline-light"
                          onClick={() => setShowCertificateModal(true)}
                        >
                          <FaCertificate className="me-2" />
                          View Certificate
                        </Button>
                      )}
                    </div>
                  </Col>
                </Row>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* Safety Tips */}
        <div className="section-heading mb-4">
          <span className="heading-line"></span>
          <span>
            <FaInfoCircle className="me-2" />
            Essential Road Safety Tips
          </span>
          <span className="heading-line"></span>
        </div>

        <Row className="g-4 mb-5">
          {safetyTips.map((tip, index) => (
            <Col md={6} lg={3} key={index}>
              <Card className="tip-card">
                <Card.Body className="d-flex flex-column">
                  <div className="tip-header">
                    <span className="tip-icon">{tip.icon}</span>
                    <h3 className="tip-title">{tip.title}</h3>
                  </div>
                  <p className="tip-content">{tip.description}</p>
                  <div className="tip-points">
                    {tip.points.map((point, idx) => (
                      <div className="tip-point" key={idx}>
                        <FaCheckCircle className="point-icon" />
                        <span>{point}</span>
                      </div>
                    ))}
                  </div>
                  <div className="tip-footer mt-auto">
                    <span className="fine-badge">Fine: {tip.fine}</span>
                    <Button 
                      variant="outline-primary" 
                      size="sm" 
                      className="learn-more-btn"
                      onClick={() => handleLearnMore(tip)}
                    >
                      Learn More
                      <FaArrowRight className="ms-2" />
                    </Button>
                  </div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>

        {/* Emergency Contacts */}
        <div className="section-heading mb-4">
          <span className="heading-line"></span>
          <span>
            <FaAmbulance className="me-2 pulse-icon" style={{ color: '#d32f2f' }} />
            Emergency Helpline Numbers
          </span>
          <span className="heading-line"></span>
        </div>

        <Card className="emergency-card mb-4">
          <Card.Body>
            <h3 className="emergency-title mb-4">
              <FaExclamationTriangle className="pulse-icon" style={{ color: '#d32f2f' }} />
              Save These Numbers - They Could Save a Life
              <FaExclamationTriangle className="pulse-icon" style={{ color: '#d32f2f' }} />
            </h3>
            <Row className="g-4">
              {emergencyContacts.map((contact, index) => (
                <Col xs={6} md={3} key={index}>
                  <div 
                    className={`emergency-item ${contact.color}`}
                    onClick={() => handleEmergencyCall(contact.number)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div className="emergency-icon">{contact.icon}</div>
                    <h3>{contact.number}</h3>
                    <p>{contact.name}</p>
                  </div>
                </Col>
              ))}
            </Row>
          </Card.Body>
        </Card>

        {/* Pledge Modal */}
        <Modal 
          show={showPledgeModal} 
          onHide={() => setShowPledgeModal(false)}
          centered
          className="pledge-modal"
        >
          <Modal.Header closeButton className="modal-header-custom">
            <Modal.Title>
              <FaHandsHelping className="me-2" />
              Take the Road Safety Pledge
            </Modal.Title>
          </Modal.Header>
          <Form onSubmit={handlePledgeSubmit}>
            <Modal.Body className="modal-body-custom">
              <div className="pledge-preview mb-4">
                <p className="pledge-preview-text">
                  "I solemnly pledge to follow all traffic rules and regulations. 
                  I will always wear a helmet while riding a two-wheeler and seatbelt while driving. 
                  I will never drink and drive, never use mobile phone while driving, 
                  and always respect pedestrians' rights. I will be a responsible citizen 
                  and contribute to making Indian roads safer for everyone."
                </p>
              </div>
              <Form.Group className="mb-3">
                <Form.Label>Full Name *</Form.Label>
                <Form.Control 
                  type="text" 
                  placeholder="Enter your full name"
                  value={pledgeForm.name}
                  onChange={(e) => setPledgeForm({...pledgeForm, name: e.target.value})}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Email Address *</Form.Label>
                <Form.Control 
                  type="email" 
                  placeholder="Enter your email"
                  value={pledgeForm.email}
                  onChange={(e) => setPledgeForm({...pledgeForm, email: e.target.value})}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Check 
                  type="checkbox"
                  label="I agree to follow all road safety rules and regulations"
                  checked={pledgeForm.agree}
                  onChange={(e) => setPledgeForm({...pledgeForm, agree: e.target.checked})}
                  required
                />
              </Form.Group>
            </Modal.Body>
            <Modal.Footer className="modal-footer-custom">
              <Button variant="secondary" onClick={() => setShowPledgeModal(false)}>
                <FaTimesCircle className="me-2" />
                Cancel
              </Button>
              <Button variant="primary" type="submit">
                <FaCheckCircle className="me-2" />
                Submit Pledge
              </Button>
            </Modal.Footer>
          </Form>
        </Modal>

        {/* Certificate Modal */}
        <Modal 
          show={showCertificateModal} 
          onHide={() => setShowCertificateModal(false)}
          centered
          size="lg"
          className="certificate-modal"
        >
          <Modal.Header closeButton className="modal-header-custom">
            <Modal.Title>
              <FaCertificate className="me-2" />
              Your Road Safety Certificate
            </Modal.Title>
          </Modal.Header>
          <Modal.Body className="modal-body-custom">
            <div className="certificate-container">
              <div className="certificate-border">
                <div className="certificate-content">
                  <div className="certificate-header">
                    <h2>Certificate of Commitment</h2>
                    <p className="certificate-subtitle">ROAD SAFETY PLEDGE</p>
                  </div>
                  <div className="certificate-body">
                    <p className="certificate-text">This is to certify that</p>
                    <div className="certificate-name">
                      {pledgeForm.name || 'Road Safety Champion'}
                    </div>
                    <p className="certificate-text">
                      has taken the pledge to be a responsible road user and 
                      committed to following all traffic rules and safety measures.
                    </p>
                    <div className="certificate-details">
                      <div className="detail-item">
                        <label>Pledge ID</label>
                        <span>{pledgeId || 'RS' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}</span>
                      </div>
                      <div className="detail-item">
                        <label>Date</label>
                        <span>{new Date().toLocaleDateString('en-IN', { 
                          day: '2-digit', 
                          month: 'long', 
                          year: 'numeric' 
                        })}</span>
                      </div>
                      <div className="detail-item">
                        <label>Valid Until</label>
                        <span>Lifetime</span>
                      </div>
                      <div className="detail-item">
                        <label>Status</label>
                        <span style={{ color: '#4caf50' }}>Active ✓</span>
                      </div>
                    </div>
                  </div>
                  <div className="certificate-footer">
                    <p className="certificate-motto">
                      "Safety First, Because Lives Matter"
                    </p>
                    <div className="certificate-seal">
                      <FaCertificate className="seal-icon" />
                      <span>Officially Pledged</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer className="modal-footer-custom">
            <Button variant="secondary" onClick={() => setShowCertificateModal(false)}>
              Close
            </Button>
            <Button variant="primary" onClick={() => window.print()}>
              <FaExternalLinkAlt className="me-2" />
              Download Certificate
            </Button>
          </Modal.Footer>
        </Modal>

        {/* Learn More Modal */}
        <Modal 
          show={showTipModal} 
          onHide={() => setShowTipModal(false)}
          centered
          size="lg"
        >
          {selectedTip && (
            <>
              <Modal.Header closeButton style={{ 
                background: `linear-gradient(135deg, ${selectedTip.color} 0%, ${selectedTip.color}dd 100%)`,
                color: 'white',
                border: 'none'
              }}>
                <Modal.Title className="d-flex align-items-center">
                  <span style={{ fontSize: '2rem', marginRight: '1rem' }}>{selectedTip.icon}</span>
                  {selectedTip.title}
                </Modal.Title>
              </Modal.Header>
              <Modal.Body className="p-4">
                <h5 className="mb-3" style={{ color: selectedTip.color }}>Why This Matters</h5>
                <p className="mb-4" style={{ fontSize: '1.1rem', lineHeight: '1.6' }}>
                  {selectedTip.detailedInfo}
                </p>
                
                <h5 className="mb-3" style={{ color: selectedTip.color }}>Key Safety Points</h5>
                <Row className="mb-4">
                  {selectedTip.points.map((point, idx) => (
                    <Col md={4} key={idx} className="mb-2">
                      <div className="d-flex align-items-center">
                        <FaCheckCircle className="me-2" style={{ color: '#4caf50' }} />
                        <span>{point}</span>
                      </div>
                    </Col>
                  ))}
                </Row>
                
                <div className="alert alert-danger d-flex align-items-center" role="alert">
                  <FaExclamationTriangle className="me-3" style={{ fontSize: '1.5rem' }} />
                  <div>
                    <strong>Legal Consequence:</strong> Violation can result in a fine of {selectedTip.fine}
                  </div>
                </div>
                
                <div className="alert alert-info mt-3">
                  <FaInfoCircle className="me-2" />
                  <strong>Did you know?</strong> Following this safety rule can reduce accident risk by up to 70%.
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button variant="secondary" onClick={() => setShowTipModal(false)}>
                  Close
                </Button>
                <Button 
                  variant="primary" 
                  onClick={() => {
                    setShowTipModal(false);
                    setShowPledgeModal(true);
                  }}
                  style={{ background: selectedTip.color, border: 'none' }}
                >
                  <FaHandsHelping className="me-2" />
                  Take Safety Pledge
                </Button>
              </Modal.Footer>
            </>
          )}
        </Modal>
      </Container>
    </section>
  );
};

export default AwarenessSection;