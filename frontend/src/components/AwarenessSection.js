import React from 'react';
import { Container, Row, Col, Card, Button, Badge } from 'react-bootstrap';

const AwarenessSection = () => {

  const tips = [
    {
      icon: '🚦',
      title: 'Traffic Signals',
      content: 'Always stop at red lights. Running red lights can cause fatal accidents and heavy fines.',
      fine: '₹5000',
      link: 'https://morth.nic.in', 
      points: ['Stop at amber light', 'Look both ways before going', 'Never jump signals']
    },
    {
      icon: '🪖',
      title: 'Helmet Safety',
      content: 'Wearing a helmet reduces risk of head injury by 69%. Always wear ISI marked helmets.',
      fine: '₹1000',
      link: 'https://morth.nic.in/road-safety',
      points: ['Wear helmet properly strapped', 'Replace helmet every 5 years', 'Both rider and pillion must wear']
    },
    {
      icon: '🚗',
      title: 'Seatbelt',
      content: 'Seatbelts reduce fatal injury risk by 45%. Always wear seatbelt even for short trips.',
      fine: '₹1000',
      link: 'https://morth.nic.in',
      points: ['All passengers must wear belts', 'Children in back seat', 'Properly adjusted']
    },
    {
      icon: '🏍️',
      title: 'Triple Riding',
      content: 'Two-wheelers are designed for two persons only. Triple riding is illegal and dangerous.',
      fine: '₹2000',
      link: 'https://parivahan.gov.in',
      points: ['Only one pillion allowed', 'No standing on footboard', 'Use separate vehicle']
    },
    {
      icon: '⚡',
      title: 'Speed Limits',
      content: 'Follow speed limits. Higher speed reduces reaction time and increases accident severity.',
      fine: '₹1500+',
      link: 'https://morth.nic.in',
      points: ['City: 50 km/h', 'Highway: 80 km/h', 'School zones: 25 km/h']
    },
    {
      icon: '📱',
      title: 'Mobile Phone',
      content: 'Using phone while driving increases accident risk by 400%. Never text and drive.',
      fine: '₹5000',
      link: 'https://morth.nic.in',
      points: ['Use hands-free only', 'Pull over to take calls', 'No texting while driving']
    }
  ];

  const stats = [
    { number: '1.5L+', label: 'Annual Road Deaths', color: 'danger' },
    { number: '70%', label: 'Due to Human Error', color: 'warning' },
    { number: '₹1Cr+', label: 'Fines Collected Daily', color: 'info' },
    { number: '50%', label: 'Accidents Preventable', color: 'success' }
  ];

  return (
    <Container className="py-4">
      <h2 className="mb-4 text-center">🚦 Traffic Safety Awareness</h2>

      {/* 📊 STATS */}
      <Row className="mb-5">
        {stats.map((stat, idx) => (
          <Col md={3} key={idx}>
            <Card className={`text-center border-${stat.color} mb-3 shadow-sm`}>
              <Card.Body>
                <h1 className={`display-5 text-${stat.color}`}>{stat.number}</h1>
                <p className="text-muted">{stat.label}</p>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 📢 PLEDGE */}
      <Row className="mb-4">
        <Col>
          <Card className="bg-primary text-white shadow">
            <Card.Body>
              <h4>📢 Road Safety Pledge</h4>
              <p>
                "I promise to follow traffic rules, wear helmet/seatbelt, 
                not use phone while driving, and never drink and drive. 
                Let's make our roads safer together!"
              </p>
              <Button variant="light">Take the Pledge</Button>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* 🧠 TIPS */}
      <h3 className="mb-3">Safety Tips & Guidelines</h3>
      <Row>
        {tips.map((tip, idx) => (
          <Col md={6} lg={4} key={idx} className="mb-4">
            <Card className="h-100 shadow-sm border-0">
              <Card.Body>
                <div className="d-flex align-items-center mb-3">
                  <span style={{ fontSize: '2.5rem' }}>{tip.icon}</span>
                  <h5 className="ms-2 mb-0">{tip.title}</h5>
                </div>

                <p className="text-muted small">{tip.content}</p>

                <div className="mb-3">
                  {tip.points.map((point, i) => (
                    <div key={i} className="d-flex align-items-center mb-1">
                      <small className="text-success me-2">✓</small>
                      <small>{point}</small>
                    </div>
                  ))}
                </div>

                <div className="d-flex justify-content-between align-items-center">
                  <Badge bg="danger">Fine: {tip.fine}</Badge>

                  {/* 🔗 UPDATED BUTTON */}
                  <Button
                    size="sm"
                    variant="outline-primary"
                    title="Open official government website"
                    onClick={() => window.open(tip.link, '_blank', 'noopener,noreferrer')}
                  >
                    Learn More
                  </Button>
                </div>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 📞 EMERGENCY */}
      <Row className="mt-4">
        <Col>
          <Card className="bg-light shadow-sm">
            <Card.Body>
              <h5>📞 Emergency Contacts</h5>
              <Row className="mt-3">
                <Col md={3}>
                  <Card className="text-center border-danger">
                    <Card.Body>
                      <h4>🚑 108</h4>
                      <small>Ambulance</small>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={3}>
                  <Card className="text-center border-primary">
                    <Card.Body>
                      <h4>🚔 100</h4>
                      <small>Police</small>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={3}>
                  <Card className="text-center border-warning">
                    <Card.Body>
                      <h4>🔥 101</h4>
                      <small>Fire</small>
                    </Card.Body>
                  </Card>
                </Col>
                <Col md={3}>
                  <Card className="text-center border-info">
                    <Card.Body>
                      <h4>📞 1033</h4>
                      <small>Traffic Helpline</small>
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
            </Card.Body>
          </Card>
        </Col>
      </Row>

    </Container>
  );
};

export default AwarenessSection;